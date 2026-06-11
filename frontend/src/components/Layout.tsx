import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { Me } from '../api/types';

const NAV = [
  { to: '/library', label: 'Bibliothèque' },
  { to: '/search', label: 'Recherche' },
  { to: '/storage', label: 'Rangement' },
  { to: '/map', label: 'Carte' },
  { to: '/timeline', label: 'Frise' },
  { to: '/import', label: 'Import' },
  { to: '/add', label: 'Ajouter' },
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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/library" className="flex shrink-0 items-center gap-2">
            <Disc />
            <span className="font-display text-xl font-bold tracking-tight">Vinylarium</span>
          </Link>
          <nav className="no-scrollbar ml-1 flex flex-1 items-center gap-1 overflow-x-auto">
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
          <div className="flex shrink-0 items-center gap-1">
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
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-xs text-mocha/60">
        Vinylarium · une idée de Julien Campinotti, portée par Samy Bensalem
      </footer>
    </div>
  );
}
