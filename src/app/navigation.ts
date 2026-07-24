export type PublicNavigationItem = {
  path: string;
  label: string;
  icon: 'home' | 'golf' | 'tours' | 'chart' | 'coin';
};

export const navigationItems: PublicNavigationItem[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/matches', label: 'Golf', icon: 'golf' },
  { path: '/tours', label: 'Tours', icon: 'tours' },
  { path: '/stats', label: 'Stats', icon: 'chart' },
  { path: '/betting', label: 'Bet Punto', icon: 'coin' },
];
