import { navigationItems } from '../app/navigation';

type Props = { currentPath: string; onNavigate: (path: string) => void };

export function BottomNav({ currentPath, onNavigate }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {navigationItems.slice(0, 6).map(({ path, label, icon }) => (
        <button key={path} className={currentPath === path ? 'active' : ''} onClick={() => onNavigate(path)}>
          <strong>{icon}</strong>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
