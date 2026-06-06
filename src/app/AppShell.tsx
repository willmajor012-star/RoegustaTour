import { useMemo, useState } from 'react';
import { navigationItems } from './navigation';
import { routes } from './routes';
import { BrandHeader } from '../components/BrandHeader';
import { BottomNav } from '../components/BottomNav';

export function AppShell() {
  const initialPath = window.location.pathname === '/' ? '/' : window.location.pathname;
  const [path, setPath] = useState(initialPath);
  const route = useMemo(() => routes.find((item) => item.path === path) ?? routes[0], [path]);
  const navigate = (nextPath: string) => {
    window.history.pushState(null, '', nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <BrandHeader />
      <nav className="top-nav" aria-label="Desktop navigation">
        {navigationItems.map(({ path: itemPath, label }) => <button className={path === itemPath ? 'active' : ''} key={itemPath} onClick={() => navigate(itemPath)}>{label}</button>)}
      </nav>
      <main>{route.element}</main>
      <BottomNav currentPath={path} onNavigate={navigate} />
    </div>
  );
}
