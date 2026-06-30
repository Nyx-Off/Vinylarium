import { useMemo } from 'react';
import { useAuth } from './auth';

// Per-profile UI toggles surfaced in Paramètres → Affichage. Switching one off
// hides its nav entry / library view everywhere. Stored in
// `user.preferences.features`; a MISSING key means ON, so existing profiles
// (and brand-new ones) keep everything enabled until they opt out.
export type FeatureKey =
  | 'map'
  | 'timeline'
  | 'stats'
  | 'storage'
  | 'viewWall'
  | 'viewCrate'
  | 'viewPile'
  | 'random';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  group: 'nav' | 'library';
}

export const FEATURES: FeatureDef[] = [
  { key: 'map', label: 'Carte du monde', description: 'Le globe interactif des origines (menu « Carte »)', group: 'nav' },
  { key: 'timeline', label: 'Frise chronologique', description: 'Le parcours des années (menu « Frise »)', group: 'nav' },
  { key: 'stats', label: 'Statistiques', description: 'Le tableau de bord chiffré de la collection (menu « Stats »)', group: 'nav' },
  { key: 'storage', label: 'Rangement', description: 'Le suivi des emplacements physiques', group: 'nav' },
  { key: 'viewWall', label: 'Vue « Mur »', description: 'La grille de pochettes', group: 'library' },
  { key: 'viewCrate', label: 'Vue « Bac »', description: 'Les bacs à vinyles 3D feuilletables', group: 'library' },
  { key: 'viewPile', label: 'Vue « Pile »', description: 'Les piles de pochettes par artiste', group: 'library' },
  { key: 'random', label: 'Bouton « Au hasard »', description: 'La roulette qui tire un disque au sort', group: 'library' },
];

// The three library view modes — at least one must stay on (LibraryPage falls
// back to the wall if a profile somehow turns all three off).
export const LIBRARY_VIEW_KEYS: FeatureKey[] = ['viewWall', 'viewCrate', 'viewPile'];

export type FeatureFlags = Record<FeatureKey, boolean>;

/** Resolve stored preferences into a full flag map; anything unset defaults to ON. */
export function resolveFeatures(prefs: Record<string, unknown> | null | undefined): FeatureFlags {
  const stored = (prefs?.features ?? {}) as Record<string, unknown>;
  const out = {} as FeatureFlags;
  for (const f of FEATURES) out[f.key] = stored[f.key] !== false;
  return out;
}

export function useFeatures(): FeatureFlags {
  const { user } = useAuth();
  return useMemo(() => resolveFeatures(user?.preferences), [user?.preferences]);
}
