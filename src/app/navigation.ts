export type PublicNavigationItem = {
  path: string;
  label: string;
  icon: 'home' | 'flag' | 'teams' | 'chart' | 'coin' | 'info';
};

export const navigationItems: PublicNavigationItem[] = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/matches', label: 'Results', icon: 'flag' },
  { path: '/teams', label: 'Teams', icon: 'teams' },
  { path: '/stats', label: 'Stats', icon: 'chart' },
  { path: '/betting', label: 'Bet Punto', icon: 'coin' },
  { path: '/info', label: 'Info', icon: 'info' },
];
