import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { fetchWithTimeout } from './http';

/**
 * Application self-update plumbing.
 *
 * The API container cannot rebuild itself, so the work is split:
 *  - HERE (backend): read the host checkout's commit from the mounted `.git`,
 *    compare it against GitHub (daily + on demand), and on request drop a
 *    flag file in `${STORAGE_DIR}/update/`.
 *  - The `updater` sidecar container (scripts/updater-daemon.sh) watches that
 *    flag, runs `git pull` + `docker compose build/up` on the host checkout,
 *    and reports progress into `status.json` + `update.log`, which the API
 *    serves back to the UI.
 */

export interface UpdateCommit {
  sha: string;
  message: string;
  date: string | null;
}

export interface UpdateCheck {
  checkedAt: string;
  currentSha: string | null;
  latestSha: string | null;
  updateAvailable: boolean;
  behindBy: number | null;
  commits: UpdateCommit[]; // newest first, capped
  error: string | null;
}

const SETTING_KEY = 'update:lastCheck';
const MAX_COMMITS = 15;

const updateDir = () => path.join(config.storageDir, 'update');
const requestFile = () => path.join(updateDir(), 'request.json');
const statusFile = () => path.join(updateDir(), 'status.json');
const logFile = () => path.join(updateDir(), 'update.log');

/** Resolve the host checkout's HEAD commit by parsing the mounted .git. */
export async function readLocalSha(): Promise<string | null> {
  try {
    const head = (await fs.readFile(path.join(config.update.gitDir, 'HEAD'), 'utf8')).trim();
    if (/^[0-9a-f]{40}$/i.test(head)) return head; // detached HEAD
    const m = head.match(/^ref:\s*(.+)$/);
    if (!m) return null;
    const ref = m[1].trim();
    try {
      const sha = (await fs.readFile(path.join(config.update.gitDir, ref), 'utf8')).trim();
      if (/^[0-9a-f]{40}$/i.test(sha)) return sha;
    } catch {
      // loose ref absent — fall through to packed-refs
    }
    const packed = await fs.readFile(path.join(config.update.gitDir, 'packed-refs'), 'utf8');
    for (const line of packed.split('\n')) {
      const [sha, name] = line.trim().split(/\s+/);
      if (name === ref && /^[0-9a-f]{40}$/i.test(sha ?? '')) return sha;
    }
    return null;
  } catch {
    return null;
  }
}

async function github(pathname: string): Promise<Response> {
  return fetchWithTimeout(
    `https://api.github.com/repos/${config.update.repo}${pathname}`,
    {
      headers: {
        'User-Agent': 'Vinylarium-updater',
        Accept: 'application/vnd.github+json',
      },
    },
    15_000,
  );
}

/** Compare the local commit against the GitHub branch and cache the result. */
export async function runUpdateCheck(): Promise<UpdateCheck> {
  const checkedAt = new Date().toISOString();
  const currentSha = await readLocalSha();
  let result: UpdateCheck = {
    checkedAt,
    currentSha,
    latestSha: null,
    updateAvailable: false,
    behindBy: null,
    commits: [],
    error: null,
  };

  try {
    if (currentSha) {
      // base...head → "ahead_by" is how many commits GitHub's branch has
      // that we don't, i.e. how far behind this install is.
      const res = await github(`/compare/${currentSha}...${config.update.branch}`);
      if (res.ok) {
        const data = (await res.json()) as {
          ahead_by: number;
          commits: { sha: string; commit: { message: string; committer?: { date?: string } } }[];
        };
        const commits = (data.commits ?? [])
          .map((c) => ({
            sha: c.sha,
            message: (c.commit?.message ?? '').split('\n')[0],
            date: c.commit?.committer?.date ?? null,
          }))
          .reverse() // GitHub returns oldest→newest; the UI wants newest first
          .slice(0, MAX_COMMITS);
        result = {
          ...result,
          latestSha: commits[0]?.sha ?? currentSha,
          updateAvailable: data.ahead_by > 0,
          behindBy: data.ahead_by,
          commits,
        };
        await persist(result);
        return result;
      }
      // 404 = local commit unknown to GitHub (local work) — fall through to
      // a plain "latest commit" comparison.
    }
    const res = await github(`/commits/${config.update.branch}`);
    if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
    const latest = (await res.json()) as {
      sha: string;
      commit: { message: string; committer?: { date?: string } };
    };
    result = {
      ...result,
      latestSha: latest.sha,
      updateAvailable: currentSha !== null && latest.sha !== currentSha,
      behindBy: null,
      commits: [
        {
          sha: latest.sha,
          message: (latest.commit?.message ?? '').split('\n')[0],
          date: latest.commit?.committer?.date ?? null,
        },
      ],
    };
  } catch (e) {
    result.error = (e as Error).message;
  }
  await persist(result);
  return result;
}

async function persist(check: UpdateCheck) {
  try {
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: check as object },
      create: { key: SETTING_KEY, value: check as object },
    });
  } catch {
    // cache only — never let it break a check
  }
}

export async function getCachedCheck(): Promise<UpdateCheck | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return (row?.value as UpdateCheck | undefined) ?? null;
}

/** Daily background check (server process only). */
export function scheduleDailyUpdateCheck(log: (msg: string) => void) {
  const run = async () => {
    const check = await runUpdateCheck();
    log(
      check.error
        ? `Update check failed: ${check.error}`
        : `Update check: ${check.updateAvailable ? `${check.behindBy ?? '?'} commit(s) behind` : 'up to date'}`,
    );
  };
  setTimeout(run, 20_000); // first check shortly after boot
  setInterval(run, 24 * 60 * 60 * 1000);
}

/** Ask the updater sidecar to run the update. */
export async function requestUpdate(requestedBy: string) {
  await fs.mkdir(updateDir(), { recursive: true });
  await fs.writeFile(
    statusFile(),
    JSON.stringify({ state: 'requested', detail: 'En attente du service de mise à jour', at: new Date().toISOString() }),
  );
  await fs.writeFile(
    requestFile(),
    JSON.stringify({ requestedBy, at: new Date().toISOString() }),
  );
}

export interface UpdateStatus {
  state: 'idle' | 'requested' | 'running' | 'done' | 'error';
  detail: string | null;
  at: string | null;
  log: string[];
}

export async function readUpdateStatus(): Promise<UpdateStatus> {
  let state: UpdateStatus = { state: 'idle', detail: null, at: null, log: [] };
  try {
    const raw = JSON.parse(await fs.readFile(statusFile(), 'utf8'));
    state = { ...state, ...raw };
  } catch {
    return state;
  }
  try {
    const log = await fs.readFile(logFile(), 'utf8');
    state.log = log.split('\n').filter(Boolean).slice(-40);
  } catch {
    // no log yet
  }
  return state;
}
