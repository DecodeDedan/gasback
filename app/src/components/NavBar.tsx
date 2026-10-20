import { Link, useLocation } from 'react-router-dom';
import { ConnectKitButton } from 'connectkit';
import { BarChart3, Home, Store } from 'lucide-react';
import { NETWORK } from '@/gasback-config';

const links = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/merchant', label: 'Merchant', icon: Store },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];

export function NavBar() {
  const { pathname } = useLocation();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line/60 bg-page/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-4 sm:gap-6 h-16">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Gasback home">
            <img src="/gasback-mark.svg" alt="" width={28} height={28} />
            <span className="font-display font-semibold text-xl tracking-tight text-ink">
              gas<span className="text-gas">back</span>
            </span>
          </Link>

          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-line text-sm text-muted">
            <span className={`w-1.5 h-1.5 rounded-full ${NETWORK.isTestnet ? 'bg-gas' : 'bg-refund'}`} aria-hidden="true" />
            {NETWORK.chainName}
          </span>

          <nav aria-label="Main" className="hidden sm:flex gap-1">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                aria-current={pathname === to ? 'page' : undefined}
                className={`px-4 py-2 rounded-full text-sm transition-colors ${pathname === to ? 'text-ink bg-raised' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto shrink-0">
            <ConnectKitButton showBalance={false} showAvatar={false} />
          </div>
        </div>
      </header>

      {/* Phones get a bottom tab bar, within thumb reach, instead of squeezing links into the header. */}
      <nav
        aria-label="Main"
        className="sm:hidden fixed inset-x-3 bottom-3 z-50 grid grid-cols-3 rounded-full bg-raised/95 backdrop-blur-md shadow-[var(--elevation-3)] border border-line/60 p-1.5"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-current={pathname === to ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 rounded-full text-xs transition-colors ${pathname === to ? 'bg-gas text-gas-fg' : 'text-muted'}`}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
