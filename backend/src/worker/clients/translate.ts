import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';

/**
 * Best-effort machine translation for Genius album descriptions, via the
 * public Google Translate endpoint (`client=gtx` — keyless, the one the
 * translate widgets use; fine for a self-hosted app's low volume). Any
 * failure returns null so callers keep the original text — an English
 * anecdote beats no anecdote.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
// Genius descriptions can run to several thousand characters; the endpoint
// chokes on very large payloads, so split on paragraph boundaries.
const MAX_CHUNK = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function splitParagraphs(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const para of text.split(/\n\n+/)) {
    if (current && current.length + para.length + 2 > MAX_CHUNK) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateChunk(text: string, target: string): Promise<string | null> {
  const body = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: text });
  const res = await fetchWithTimeout(
    ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': config.discogs.userAgent,
      },
      body: body.toString(),
    },
    12_000,
  );
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => null);
  // Response shape: [[["translated", "original", ...], ...], ...]
  const segments = json?.[0];
  if (!Array.isArray(segments)) return null;
  const out = segments.map((s: any) => (typeof s?.[0] === 'string' ? s[0] : '')).join('');
  return out.trim().length > 0 ? out : null;
}

/**
 * Translate `text` into the configured anecdote language. Returns null when
 * translation is disabled (empty ANECDOTE_LANG) or any chunk fails — a partial
 * translation reads worse than the untouched original.
 */
export async function translateText(text: string): Promise<string | null> {
  const target = config.anecdotes.translateTo;
  if (!target) return null;
  const out: string[] = [];
  for (const chunk of splitParagraphs(text)) {
    const translated = await translateChunk(chunk, target);
    if (translated === null) return null;
    out.push(translated);
    await sleep(250);
  }
  return out.join('\n\n');
}
