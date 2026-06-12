import { prisma } from '../db/prisma';
import { config } from '../config';

/**
 * UI-managed API keys (Settings → "État des API", admin only), stored in the
 * `Setting` table and layered OVER the .env values: a saved key wins, an
 * empty one falls back to the environment. `applyApiKeyOverrides()` mutates
 * the shared `config` object in place so every client (which reads config at
 * call time) picks the change up — the API applies it on save, the worker
 * re-applies on boot and every minute.
 */

export const API_KEYS_SETTING = 'apiKeys';

export interface ApiKeyOverrides {
  discogsToken?: string;
  geniusAccessToken?: string;
}

// .env values captured once at module load — the fallback when an override
// is cleared from the UI.
const envDefaults = {
  discogsToken: config.discogs.token,
  geniusAccessToken: config.genius.accessToken,
};

export function envConfigured() {
  return {
    discogs: Boolean(envDefaults.discogsToken),
    genius: Boolean(envDefaults.geniusAccessToken),
  };
}

export async function readApiKeyOverrides(): Promise<ApiKeyOverrides> {
  const row = await prisma.setting
    .findUnique({ where: { key: API_KEYS_SETTING } })
    .catch(() => null);
  return (row?.value as ApiKeyOverrides) ?? {};
}

export async function saveApiKeyOverrides(value: ApiKeyOverrides): Promise<void> {
  await prisma.setting.upsert({
    where: { key: API_KEYS_SETTING },
    update: { value: value as object },
    create: { key: API_KEYS_SETTING, value: value as object },
  });
  await applyApiKeyOverrides();
}

export async function applyApiKeyOverrides(): Promise<void> {
  const v = await readApiKeyOverrides();
  // `config` is typed readonly but is a plain object; this module is the one
  // sanctioned place that rewrites it.
  const cfg = config as { discogs: { token: string }; genius: { accessToken: string } };
  cfg.discogs.token = v.discogsToken?.trim() || envDefaults.discogsToken;
  cfg.genius.accessToken = v.geniusAccessToken?.trim() || envDefaults.geniusAccessToken;
}
