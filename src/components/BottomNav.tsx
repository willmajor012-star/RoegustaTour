import { navigationItems, type PublicNavigationItem } from '../app/navigation';

type Props = { currentPath: string; onNavigate: (path: string) => void };

type IconName = PublicNavigationItem['icon'];

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'home') return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9 21v-6h6v6" /></svg>;
  if (name === 'flag') return <svg {...common}><path d="M6 21V4" /><path d="M6 5h11l-1.5 4L17 13H6" /></svg>;
  if (name === 'teams') return <svg {...common}><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M3.5 20a4.5 4.5 0 0 1 9 0" /><path d="M11.5 20a4.5 4.5 0 0 1 9 0" /></svg>;
  if (name === 'person') return <svg {...common}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
  if (name === 'chart') return <svg {...common}><path d="M4 20h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-4" /></svg>;
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
