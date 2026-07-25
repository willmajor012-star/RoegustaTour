import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { isRoutePath, routeForPath } from './routes';
import { AdminBrandHeader } from '../components/AdminBrandHeader';
import { BrandHeader } from '../components/BrandHeader';
import { BottomNav } from '../components/BottomNav';
import { RefreshButton } from '../components/RefreshButton';
import { PublicPasswordGate } from '../components/PublicPasswordGate';

function getCurrentPath() {
  if (window.location.pathname === '/players') {
    window.history.replaceState(null, '', `/teams${window.location.search}${window.location.hash}`);
    return '/teams';
  }
  return window.location.pathname === '/' ? '/' : window.location.pathname;
}

type AppHistoryState = {
  roegustaApp?: boolean;
  backPath?: string;
};

function backFallback(path: string) {
  if (path.startsWith('/courses/')) return '/courses';
  if (path === '/courses' || path === '/teams' || path === '/info') return '/tours';
  return '/';
}

export function AppShell() {
  const [path, setPath] = useState(getCurrentPath);
  const route = useMemo(() => routeForPath(path), [path]);

  useEffect(() => {
    const currentState = (window.history.state ?? {}) as AppHistoryState;
    if (!currentState.roegustaApp) {
      window.history.replaceState({ ...currentState, roegustaApp: true }, '', window.location.href);
    }
    const handlePopState = () => setPath(getCurrentPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath: string) => {
    const nextUrl = new URL(nextPath, window.location.href);
    const normalizedPath = nextUrl.pathname === '/players' ? '/teams' : nextUrl.pathname;
    const normalizedUrl = `${normalizedPath}${nextUrl.search}${nextUrl.hash}`;
    const backPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState({ roegustaApp: true, backPath }, '', normalizedUrl);
    setPath(normalizedPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    const state = (window.history.state ?? {}) as AppHistoryState;
    if (state.backPath) {
      window.history.back();
      return;
    }
    navigate(backFallback(path));
  };

  const handleInternalLink = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || (!isRoutePath(url.pathname) && url.pathname !== '/players')) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  };

  if (path === '/admin') {
    return <div className="app-shell" onClick={handleInternalLink}><RefreshButton /><AdminBrandHeader /><main>{route.element}</main><BottomNav currentPath={path} onNavigate={navigate} /></div>;
  }

  return (
    <PublicPasswordGate isAdminRoute={false}>
      <div className="app-shell" onClick={handleInternalLink}>
        <RefreshButton />
        <BrandHeader />
        <main>
          {path !== '/' && <button className="app-back-button" type="button" onClick={goBack}><span aria-hidden="true">‹</span> Back</button>}
          {route.element}
        </main>
        <BottomNav currentPath={path} onNavigate={navigate} />
      </div>
    </PublicPasswordGate>
  );
}
