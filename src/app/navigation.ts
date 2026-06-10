export type PublicNavigationItem = {
  path: string;
  label: string;
  icon: 'home' | 'flag' | 'teams' | 'person' | 'chart' | 'coin';
};

export const navigationItems: PublicNavigationItem[] = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/matches', label: 'Results', icon: 'flag' },
  { path: '/teams', label: 'Teams', icon: 'teams' },
  { path: '/players', label: 'Players', icon: 'person' },
  { path: '/stats', label: 'Stats', icon: 'chart' },
  { path: '/betting', label: 'Bet Punto', icon: 'coin' },
];
