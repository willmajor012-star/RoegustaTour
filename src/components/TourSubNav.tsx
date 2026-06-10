import { navigationItems } from '../app/navigation';

type Props = { currentPath: string; onNavigate: (path: string) => void };

export function TourSubNav({ currentPath, onNavigate }: Props) {
  const publicItems = navigationItems.filter((item) => item.path !== '/admin');
  return (
    <nav className="tour-subnav" aria-label="Tour sections">
      {publicItems.map(({ path, label }) => (
        <button className={currentPath === path ? 'active' : ''} key={path} onClick={() => onNavigate(path)}>{label}</button>
      ))}
    </nav>
  );
}
