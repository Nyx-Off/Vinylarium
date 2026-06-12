import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { Me } from '../api/types';

// L'ajout de disques (recherche Discogs), l'import et la sauvegarde vivent
// dans Paramètres (profil), pas dans la navigation.
const NAV = [
  { to: '/library', label: 'Bibliothèque' },
  { to: '/search', label: 'Recherche' },
  { to: '/storage', label: 'Rangement' },
  { to: '/map', label: 'Carte' },
  { to: '/timeline', label: 'Frise' },
];

// Mobile bottom bar: the four everyday destinations as tabs, the rest behind
// a "Plus" sheet — the old horizontally-scrolling pill strip hid half the
// links off-screen on a phone.
const TABS = [
  { to: '/library', label: 'Bibliothèque', icon: '💿' },
  { to: '/search', label: 'Recherche', icon: '🔍' },
  { to: '/map', label: 'Carte', icon: '🌍' },
  { to: '/timeline', label: 'Frise', icon: '🕰️' },
];
const MORE = [
  { to: '/storage', label: 'Rangement', icon: '📦' },
  { to: '/settings', label: 'Paramètres', icon: '⚙️' },
];

export function Disc({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#16120d" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#463a2c" strokeWidth="0.6" />
      <circle cx="16" cy="16" r="6.5" fill="#b8451f" />
      <circle cx="16" cy="16" r="1.6" fill="#16120d" />
    </svg>
  );
}

function Avatar({ user }: { user: Me | null }) {
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />;
  }
  const initial = user?.displayName?.[0]?.toUpperCase() ?? '?';
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-cream">
      {initial}
    </span>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // Navigating (from the sheet or anywhere else) closes the sheet.
  useEffect(() => setMoreOpen(false), [pathname]);

  const moreActive = MORE.some((m) => pathname.startsWith(m.to));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/library" className="flex shrink-0 items-center gap-2">
            <Disc />
            <span className="font-display text-xl font-bold tracking-tight">Vinylarium</span>
          </Link>
          {/* Desktop nav — on mobile the bottom tab bar takes over */}
          <nav className="no-scrollbar ml-1 hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  clsx(
                    'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-cream' : 'text-mocha hover:bg-ink/5',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex flex-1 items-center justify-end gap-1 md:flex-initial">
            <Link
              to="/settings"
              className="flex items-center gap-2 rounded-full bg-ink/5 px-2 py-1 hover:bg-ink/10"
            >
              <Avatar user={user} />
              <span className="hidden text-sm font-medium sm:block">{user?.displayName}</span>
            </Link>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="btn-ghost px-3"
              title="Changer de profil"
            >
              ⎋
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 py-8 pb-24 text-center text-xs text-mocha/60 md:pb-8">
        Vinylarium · une idée de Julien Campinotti, portée par Samy Bensalem
      </footer>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {moreOpen && (
          <>
            {/* dim + close everything above the bar */}
            <div
              className="absolute inset-x-0 bottom-full h-screen bg-ink/20"
              onClick={() => setMoreOpen(false)}
            />
            <div className="absolute bottom-full right-2 mb-2 w-56 overflow-hidden rounded-2xl border border-ink/10 bg-cream shadow-xl">
              {MORE.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 border-b border-ink/5 px-4 py-3 text-sm font-medium',
                      isActive ? 'text-accent' : 'text-ink',
                    )
                  }
                >
                  <span className="text-base leading-none">{m.icon}</span>
                  {m.label}
                </NavLink>
              ))}
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-mocha"
              >
                <span className="text-base leading-none">⎋</span>
                Changer de profil
              </button>
            </div>
          </>
        )}
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
                  isActive ? 'text-accent' : 'text-mocha',
                )
              }
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={clsx(
              'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
              moreActive || moreOpen ? 'text-accent' : 'text-mocha',
            )}
          >
            <span className="text-lg leading-none">⋯</span>
            Plus
          </button>
        </div>
      </nav>
    </div>
  );
}
