import { useEffect, useMemo, useState } from 'react';
import { routes } from './routes';
import { BrandHeader } from '../components/BrandHeader';
import { BottomNav } from '../components/BottomNav';

function getCurrentPath() {
  return window.location.pathname === '/' ? '/' : window.location.pathname;
}

export function AppShell() {
  const [path, setPath] = useState(getCurrentPath);
  const route = useMemo(() => routes.find((item) => item.path === path) ?? routes[0], [path]);

  useEffect(() => {
    const handlePopState = () => setPath(getCurrentPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath: string) => {
    window.history.pushState(null, '', nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <BrandHeader />
      <main>{route.element}</main>
      <BottomNav currentPath={path} onNavigate={navigate} />
    </div>
  );
}
