import { navigationItems, type PublicNavigationItem } from '../app/navigation';

type Props = { currentPath: string; onNavigate: (path: string) => void };

type IconName = PublicNavigationItem['icon'];

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'home') return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9 21v-6h6v6" /></svg>;
  if (name === 'golf') return <svg {...common}><circle cx="9" cy="17" r="2.2" /><path d="M13 15 20 4" /><path d="m15.5 4 4.5 0 -2.3 3.7" /><path d="M4 21h12" /></svg>;
  if (name === 'tours') return <svg {...common}><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" /><path d="M9 4v16" /><path d="M12 8h4" /><path d="M12 12h4" /></svg>;
  if (name === 'chart') return <svg {...common}><path d="M4 20h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-4" /></svg>;
  if (name === 'info') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>;
  return <svg {...common}><path d="m12 3 8 6-8 12L4 9l8-6Z" /><path d="M4 9h16" /><path d="m9 9 3 12 3-12" /></svg>;
}

export function BottomNav({ currentPath, onNavigate }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {navigationItems.map(({ path, label, icon }) => (
        <button key={path} className={currentPath === path ? 'active' : ''} aria-current={currentPath === path ? 'page' : undefined} onClick={() => onNavigate(path)}>
          <NavIcon name={icon} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
