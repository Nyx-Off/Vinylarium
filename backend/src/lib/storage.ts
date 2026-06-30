import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config';
import { fetchWithTimeout } from './http';

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

/**
 * Generate a downsized JPEG thumbnail from a stored image. `srcRel` is a path
 * relative to STORAGE_DIR; the thumb is written next to it as
 * "<name>-thumb.jpg". Returns the thumb's relative path, or null on any failure
 * (a missing thumb just means the grids fall back to the full cover).
 */
export async function makeThumbnail(srcRel: string, size = 400): Promise<string | null> {
  try {
    const dir = path.posix.dirname(srcRel);
    const base = path.posix.basename(srcRel).replace(/\.[^.]+$/, '');
    const destRel = path.posix.join(dir, `${base}-thumb.jpg`);
    const buf = await sharp(absPath(srcRel))
      .rotate()
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    await fs.writeFile(absPath(destRel), buf);
    return destRel;
  } catch {
    return null;
  }
}

/** Download a remote file into storage. Returns the relative path or null on failure. */
export async function downloadToStorage(
  url: string,
  subdir: string,
  filename: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, { headers }, 30_000);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return await saveBuffer(subdir, filename, buf);
  } catch {
    return null;
  }
}
