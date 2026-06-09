import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config';

export const SUBDIRS = {
  covers: 'covers',
  avatars: 'avatars',
  imports: 'imports',
} as const;

/** Create the storage subdirectories on boot. */
export async function ensureStorageDirs(): Promise<void> {
  for (const sub of Object.values(SUBDIRS)) {
    await fs.mkdir(path.join(config.storageDir, sub), { recursive: true });
  }
}

/** Absolute path on disk for a stored relative path ("covers/x.jpg"). */
export function absPath(relPath: string): string {
  return path.join(config.storageDir, relPath);
}

/** Public URL the frontend uses to fetch a stored file. */
export function mediaUrl(relPath?: string | null): string | null {
  if (!relPath) return null;
  return `/media/${relPath.replace(/^\/+/, '')}`;
}

/** Persist a buffer under a subdir, returning the relative path. */
export async function saveBuffer(
  subdir: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const rel = path.posix.join(subdir, filename);
  await fs.mkdir(path.dirname(absPath(rel)), { recursive: true });
  await fs.writeFile(absPath(rel), data);
  return rel;
}

/** Download a remote file into storage. Returns the relative path or null on failure. */
export async function downloadToStorage(
  url: string,
  subdir: string,
  filename: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return await saveBuffer(subdir, filename, buf);
  } catch {
    return null;
  }
}
