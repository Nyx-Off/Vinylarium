import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useAuth } from './auth';

// Lightweight i18n (no dependency). The UI ships in French; English is a
// progressively-filled overlay. A missing key falls back to French, then to the
// key itself — so untranslated strings never break, they just stay French.
// Per-profile language lives in `user.preferences.lang`.
export type Lang = 'fr' | 'en';
export const LANGS: { value: Lang; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

type Dict = Record<string, string>;

const FR: Dict = {
  'nav.library': 'Bibliothèque',
  'nav.search': 'Recherche',
  'nav.storage': 'Rangement',
  'nav.map': 'Carte',
  'nav.timeline': 'Frise',
  'nav.stats': 'Stats',
  'nav.settings': 'Paramètres',
  'nav.more': 'Plus',
  'nav.changeProfile': 'Changer de profil',
  'common.loading': 'Chargement…',
  'footer.tagline': 'Vinylarium · une idée de Julien Campinotti, portée par Samy Bensalem',
  'settings.language': 'Langue',
  'settings.languageHint': "Langue de l'interface pour ce profil.",
};

const EN: Dict = {
  'nav.library': 'Library',
  'nav.search': 'Search',
  'nav.storage': 'Storage',
  'nav.map': 'Map',
  'nav.timeline': 'Timeline',
  'nav.stats': 'Stats',
  'nav.settings': 'Settings',
  'nav.more': 'More',
  'nav.changeProfile': 'Switch profile',
  'common.loading': 'Loading…',
  'footer.tagline': 'Vinylarium · an idea by Julien Campinotti, built by Samy Bensalem',
  'settings.language': 'Language',
  'settings.languageHint': 'Interface language for this profile.',
};

const MESSAGES: Record<Lang, Dict> = { fr: FR, en: EN };

export function resolveLang(prefs: Record<string, unknown> | null | undefined): Lang {
  return prefs?.lang === 'en' ? 'en' : 'fr';
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<TFn>((k) => k);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const lang = resolveLang(user?.preferences);
  const t = useMemo<TFn>(() => {
    return (key, vars) => {
      let s = MESSAGES[lang][key] ?? FR[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    };
  }, [lang]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

/** Translate a key. Usage: const t = useT(); t('nav.library'). */
export function useT(): TFn {
  return useContext(I18nContext);
}

export function useLang(): Lang {
  const { user } = useAuth();
  return resolveLang(user?.preferences);
}
