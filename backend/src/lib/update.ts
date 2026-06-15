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
  currentVersion: string | null; // VERSION file in the deployed checkout
  latestSha: string | null;
  latestVersion: string | null; // VERSION file on the GitHub branch
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

/** Read the human version string from the deployed checkout's VERSION file. */
export async function readLocalVersion(): Promise<string | null> {
  try {
    const txt = (await fs.readFile(config.update.versionFile, 'utf8')).trim();
    return txt || null;
  } catch {
    return null;
  }
}

/** Read the VERSION file on the GitHub branch (raw). null = no file there. */
async function fetchRemoteVersion(): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${config.update.repo}/${config.update.branch}/VERSION`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Vinylarium-updater' } }, 15_000);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
  const txt = (await res.text()).trim();
  return txt || null;
}

/** Dotted-number compare ("1.2.0" vs "1.10.0"); -1 if a<b, 0 if equal, 1 if a>b. */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
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
  const [currentSha, currentVersion] = await Promise.all([readLocalSha(), readLocalVersion()]);
  const result: UpdateCheck = {
    checkedAt,
    currentSha,
    currentVersion,
    latestSha: null,
    latestVersion: null,
    updateAvailable: false,
    behindBy: null,
    commits: [],
    error: null,
  };

  // Headline signal: the VERSION file on GitHub vs the deployed one.
  try {
    result.latestVersion = await fetchRemoteVersion();
  } catch (e) {
    result.error = (e as Error).message;
  }

  // Commit list + "behind by" are a best-effort bonus (WHAT changed) from a
  // git compare; a failure here must never mask the version answer above.
  try {
    // base...head → "ahead_by" is how many commits GitHub's branch has that
    // we don't, i.e. how far behind this install is.
    const cmp = currentSha
      ? await github(`/compare/${currentSha}...${config.update.branch}`)
      : null;
    if (cmp?.ok) {
      const data = (await cmp.json()) as {
        ahead_by: number;
        commits: { sha: string; commit: { message: string; committer?: { date?: string } } }[];
      };
      result.commits = (data.commits ?? [])
        .map((c) => ({
          sha: c.sha,
          message: (c.commit?.message ?? '').split('\n')[0],
          date: c.commit?.committer?.date ?? null,
        }))
        .reverse() // GitHub returns oldest→newest; the UI wants newest first
        .slice(0, MAX_COMMITS);
      result.latestSha = result.commits[0]?.sha ?? currentSha;
      result.behindBy = data.ahead_by;
    } else {
      // No local sha, or it's unknown to GitHub (local work) — just read HEAD.
      const head = await github(`/commits/${config.update.branch}`);
      if (head.ok) {
        const latest = (await head.json()) as {
          sha: string;
          commit: { message: string; committer?: { date?: string } };
        };
        result.latestSha = latest.sha;
        result.commits = [
          {
            sha: latest.sha,
            message: (latest.commit?.message ?? '').split('\n')[0],
            date: latest.commit?.committer?.date ?? null,
          },
        ];
      }
    }
  } catch {
    // commit list is optional — leave it empty
  }

  // Prefer the VERSION comparison; fall back to commit distance, then a bare
  // sha mismatch when no VERSION file is published yet.
  if (currentVersion && result.latestVersion) {
    result.updateAvailable = compareVersions(currentVersion, result.latestVersion) < 0;
  } else if (result.behindBy != null) {
    result.updateAvailable = result.behindBy > 0;
  } else if (result.latestSha && currentSha) {
    result.updateAvailable = result.latestSha !== currentSha;
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
