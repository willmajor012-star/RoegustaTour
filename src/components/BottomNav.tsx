import { useEffect, useRef, useState } from 'react';
import { moreNavigationItems, navigationItems, type PublicNavigationItem } from '../app/navigation';

type Props = { currentPath: string; onNavigate: (path: string) => void };

type IconName = PublicNavigationItem['icon'];

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'home') return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9 21v-6h6v6" /></svg>;
  if (name === 'golf') return <svg {...common}><circle cx="9" cy="17" r="2.2" /><path d="M13 15 20 4" /><path d="m15.5 4 4.5 0 -2.3 3.7" /><path d="M4 21h12" /></svg>;
  if (name === 'score') return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M10 15h4" /><path d="M12 12v7" /><path d="M8 20h8" /><path d="M8 6H4v1a4 4 0 0 0 4 4" /><path d="M16 6h4v1a4 4 0 0 1-4 4" /></svg>;
  if (name === 'coin') return <svg {...common}><path d="m12 3 8 6-8 12L4 9l8-6Z" /><path d="M4 9h16" /><path d="m9 9 3 12 3-12" /></svg>;
  return <svg {...common}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>;
}

export function BottomNav({ currentPath, onNavigate }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const firstMenuItem = useRef<HTMLButtonElement>(null);
  const moreIsActive = moreNavigationItems.some((item) => item.path === currentPath);

  useEffect(() => {
    setMoreOpen(false);
  }, [currentPath]);

  useEffect(() => {
    if (!moreOpen) return;
    firstMenuItem.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moreOpen]);

  return (
    <>
      {moreOpen && <div className="more-menu-backdrop" onMouseDown={() => setMoreOpen(false)}>
        <section id="more-menu" className="more-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="more-menu-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="more-menu-heading">
            <div><p className="eyebrow">Roegusta Tour</p><h2 id="more-menu-title">More</h2></div>
            <button className="more-menu-close" type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)}>×</button>
          </div>
          <div className="more-menu-list">
            {moreNavigationItems.map((item, index) => <button ref={index === 0 ? firstMenuItem : undefined} type="button" key={item.path} className={currentPath === item.path ? 'active' : ''} onClick={() => onNavigate(item.path)}>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <b aria-hidden="true">›</b>
            </button>)}
          </div>
        </section>
      </div>}
      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigationItems.map(({ path, label, icon }) => {
          const isMore = path === '#more';
          const isActive = isMore ? moreIsActive || moreOpen : currentPath === path;
          return <button key={path} type="button" className={isActive ? 'active' : ''} aria-current={!isMore && currentPath === path ? 'page' : undefined} aria-expanded={isMore ? moreOpen : undefined} aria-controls={isMore ? 'more-menu' : undefined} onClick={() => isMore ? setMoreOpen((current) => !current) : onNavigate(path)}>
            <NavIcon name={icon} />
            <span>{label}</span>
          </button>;
        })}
      </nav>
    </>
  );
}
