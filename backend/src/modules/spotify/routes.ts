import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { prisma } from '../../db/prisma';
import { badRequest } from '../../lib/errors';
import {
  buildAuthUrl,
  exchangeCode,
  findAlbumUri,
  getNowPlaying,
  getProfile,
  getValidAccessToken,
  playContext,
  spotifyConfigured,
} from '../../lib/spotify';

export async function spotifyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Connection status for the current user.
  app.get('/status', async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { spotifyRefreshToken: true, spotifyName: true },
    });
    return {
      configured: spotifyConfigured(),
      connected: Boolean(user?.spotifyRefreshToken),
      name: user?.spotifyName ?? null,
      // The redirect URI to register in the Spotify app (shown in Settings).
      redirectUri: config.spotify.redirectUri,
    };
  });

  // Start the OAuth flow: the frontend opens this URL, Spotify redirects back to
  // `redirectUri` (a frontend route) with ?code&state.
  app.get('/auth-url', async (req) => {
    if (!spotifyConfigured()) throw badRequest('Spotify n’est pas configuré (clés API manquantes)');
    // `returnUrl` is THIS instance's callback page (often http on a LAN). We pack
    // it into `state` so the static relay page (the registered redirect_uri) can
    // bounce the browser back here with the code — no HTTPS/tunnel needed locally.
    const { returnUrl } = z.object({ returnUrl: z.string().url() }).parse(req.query);
    const state = Buffer.from(JSON.stringify({ n: randomUUID(), r: returnUrl })).toString('base64url');
    return { url: buildAuthUrl(state), state };
  });

  // Finish the flow: exchange the code, store the refresh token + profile.
  app.post('/callback', async (req) => {
    if (!spotifyConfigured()) throw badRequest('Spotify n’est pas configuré');
    // redirect_uri for the exchange must match the one used at authorize time —
    // that's the configured relay (config.spotify.redirectUri), not this URL.
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
    const tokens = await exchangeCode(code);
    if (!tokens?.refresh_token) throw badRequest('Connexion Spotify refusée ou expirée, réessayez');
    const profile = await getProfile(tokens.access_token);
    await prisma.user.update({
      where: { id: req.user.sub },
      data: {
        spotifyRefreshToken: tokens.refresh_token,
        spotifyAccessToken: tokens.access_token,
        spotifyTokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
        spotifyId: profile?.id ?? null,
        spotifyName: profile?.name ?? null,
      },
    });
    return { connected: true, name: profile?.name ?? null };
  });

  app.post('/disconnect', async (req) => {
    await prisma.user.update({
      where: { id: req.user.sub },
      data: {
        spotifyRefreshToken: null,
        spotifyAccessToken: null,
        spotifyTokenExpires: null,
        spotifyId: null,
        spotifyName: null,
      },
    });
    return { connected: false };
  });

  // What's currently playing on the user's Spotify account.
  app.get('/now-playing', async (req) => {
    const token = await getValidAccessToken(req.user.sub);
    if (!token) return { connected: false, playing: false };
    const np = await getNowPlaying(token);
    if (!np) return { connected: true, playing: false };
    return { connected: true, playing: np.isPlaying, ...np };
  });

  // Start playing a release's album on the user's active device.
  app.post('/play', async (req) => {
    const { releaseId } = z.object({ releaseId: z.string() }).parse(req.body);
    const token = await getValidAccessToken(req.user.sub);
    if (!token) return { ok: false, reason: 'not_connected' as const };
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { title: true, artistDisplay: true },
    });
    if (!release) throw badRequest('Disque introuvable');

    const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(
      `${release.artistDisplay} ${release.title}`,
    )}`;
    const uri = await findAlbumUri(token, release.artistDisplay, release.title);
    if (!uri) return { ok: false, reason: 'not_found' as const, searchUrl };
    const result = await playContext(token, uri);
    if (result.ok) return { ok: true, uri };
    return { ok: false, reason: result.reason, searchUrl };
  });
}
