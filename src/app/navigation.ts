export type PublicNavigationItem = {
  path: string;
  label: string;
  icon: 'home' | 'golf' | 'tours' | 'calendar' | 'chart' | 'coin';
};

export const navigationItems: PublicNavigationItem[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/matches', label: 'Golf', icon: 'golf' },
  { path: '/info', label: 'Itinerary', icon: 'calendar' },
  { path: '/tours', label: 'Tours', icon: 'tours' },
  { path: '/stats', label: 'Stats', icon: 'chart' },
  { path: '/betting', label: 'Bet Punto', icon: 'coin' },
];
