import { config } from '../config';
import { prisma } from '../db/prisma';
import { fetchWithTimeout } from './http';

/**
 * Spotify integration (per-user, OAuth Authorization Code flow). One server-side
 * app (config.spotify.clientId/secret, admin-overridable) that each user
 * connects their account to. We keep the durable refresh token on the User row
 * and cache the short-lived access token + its expiry, refreshing on demand.
 *
 * "Now playing" works on any account; STARTING playback needs Spotify Premium
 * and an active device, which the play endpoint surfaces as friendly errors.
 */

// Read currently playing + control playback on the user's active device.
export const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

export function spotifyConfigured(): boolean {
  return Boolean(config.spotify.clientId && config.spotify.clientSecret);
}

function basicAuth(): string {
  return Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
}

export function buildAuthUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotify.clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: config.spotify.redirectUri,
    state,
    show_dialog: 'true',
  });
  return `https://accounts.spotify.com/authorize?${q.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse | null> {
  const res = await fetchWithTimeout(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    12_000,
  );
  if (!res.ok) return null;
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string): Promise<TokenResponse | null> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.spotify.redirectUri,
    }),
  );
}

function refreshToken(refresh: string): Promise<TokenResponse | null> {
  return tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }));
}

/** A valid access token for a user, refreshing + persisting if needed (or null). */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { spotifyRefreshToken: true, spotifyAccessToken: true, spotifyTokenExpires: true },
  });
  if (!user?.spotifyRefreshToken || !spotifyConfigured()) return null;
  const stillValid =
    user.spotifyAccessToken &&
    user.spotifyTokenExpires &&
    user.spotifyTokenExpires.getTime() > Date.now() + 30_000;
  if (stillValid) return user.spotifyAccessToken;

  const refreshed = await refreshToken(user.spotifyRefreshToken);
  if (!refreshed) return null;
  await prisma.user.update({
    where: { id: userId },
    data: {
      spotifyAccessToken: refreshed.access_token,
      spotifyTokenExpires: new Date(Date.now() + refreshed.expires_in * 1000),
      ...(refreshed.refresh_token ? { spotifyRefreshToken: refreshed.refresh_token } : {}),
    },
  });
  return refreshed.access_token;
}

async function apiFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetchWithTimeout(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  }, 12_000);
}

export interface SpotifyProfile {
  id: string;
  name: string;
}

export async function getProfile(token: string): Promise<SpotifyProfile | null> {
  const res = await apiFetch(token, '/me');
  if (!res.ok) return null;
  const j: any = await res.json();
  return { id: j.id, name: j.display_name || j.id };
}

export interface NowPlaying {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  trackUrl: string | null;
  progressMs: number;
  durationMs: number;
}

export async function getNowPlaying(token: string): Promise<NowPlaying | null> {
  const res = await apiFetch(token, '/me/player/currently-playing');
  if (res.status === 204 || res.status === 202) return null; // nothing playing
  if (!res.ok) return null;
  const j: any = await res.json();
  const item = j?.item;
  if (!item) return null;
  return {
    isPlaying: Boolean(j.is_playing),
    title: item.name ?? '',
    artist: (item.artists ?? []).map((a: any) => a.name).join(', '),
    album: item.album?.name ?? '',
    coverUrl: item.album?.images?.[0]?.url ?? null,
    trackUrl: item.external_urls?.spotify ?? null,
    progressMs: j.progress_ms ?? 0,
    durationMs: item.duration_ms ?? 0,
  };
}

/** Best-match album URI on Spotify for an artist + album title (or null). */
export async function findAlbumUri(token: string, artist: string, album: string): Promise<string | null> {
  const cleanArtist = artist.replace(/\s*\(\d+\)\s*$/, '').trim();
  const q = encodeURIComponent(`album:${album} artist:${cleanArtist}`);
  const res = await apiFetch(token, `/search?type=album&limit=5&q=${q}`);
  if (!res.ok) return null;
  const j: any = await res.json();
  const items: any[] = j?.albums?.items ?? [];
  if (items.length === 0) {
    // looser retry without the field filters
    const res2 = await apiFetch(token, `/search?type=album&limit=5&q=${encodeURIComponent(`${cleanArtist} ${album}`)}`);
    if (!res2.ok) return null;
    const j2: any = await res2.json();
    return j2?.albums?.items?.[0]?.uri ?? null;
  }
  return items[0].uri ?? null;
}

export type PlayResult =
  | { ok: true }
  | { ok: false; reason: 'no_device' | 'premium' | 'not_found' | 'error' };

/** Start playing an album context on the user's active device. */
export async function playContext(token: string, contextUri: string): Promise<PlayResult> {
  const res = await apiFetch(token, '/me/player/play', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context_uri: contextUri }),
  });
  if (res.ok || res.status === 204) return { ok: true };
  if (res.status === 404) return { ok: false, reason: 'no_device' }; // no active device
  if (res.status === 403) return { ok: false, reason: 'premium' }; // Premium required
  return { ok: false, reason: 'error' };
}
