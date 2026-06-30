import { randomBytes } from 'crypto';
import { prisma } from '../db/prisma';

// Read-only public sharing: a single random token gates an unauthenticated,
// read-only view of the collection. Stored in the Setting table so it survives
// restarts and can be revoked. There is at most ONE active share token.
const SETTING_KEY = 'publicShare';

export interface ShareState {
  enabled: boolean;
  token: string | null;
}

export async function getShare(): Promise<ShareState> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const v = (row?.value ?? null) as { enabled?: boolean; token?: string } | null;
  if (!v?.enabled || !v.token) return { enabled: false, token: null };
  return { enabled: true, token: v.token };
}

/** Create (or rotate) the share token and enable sharing. */
export async function enableShare(): Promise<ShareState> {
  const token = randomBytes(18).toString('base64url'); // ~24 chars, URL-safe
  const value = { enabled: true, token };
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value },
    create: { key: SETTING_KEY, value },
  });
  return value;
}

export async function disableShare(): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: { enabled: false, token: null } },
    create: { key: SETTING_KEY, value: { enabled: false, token: null } },
  });
}

/** Throwing guard for the public routes: resolves only when the token matches. */
export async function assertShareToken(token: string): Promise<void> {
  const share = await getShare();
  // Constant-ish comparison is overkill for a share link, but avoid leaking via
  // length: a plain mismatch returns 404 (handled by the caller).
  if (!share.enabled || !share.token || share.token !== token) {
    const err = new Error('not_found') as Error & { code?: string };
    err.code = 'SHARE_INVALID';
    throw err;
  }
}
