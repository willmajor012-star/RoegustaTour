export type PublicNavigationItem = {
  path: string;
  label: string;
  icon: 'home' | 'golf' | 'score' | 'coin' | 'more';
};

export const navigationItems: PublicNavigationItem[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/matches', label: 'Golf', icon: 'golf' },
  { path: '/score', label: 'Score', icon: 'score' },
  { path: '/betting', label: 'Bet Punto', icon: 'coin' },
  { path: '#more', label: 'More', icon: 'more' },
];

export const moreNavigationItems = [
  { path: '/teams', label: 'Teams & players', description: 'Squads, captains and player profiles' },
  { path: '/stats', label: 'Stats', description: 'Standings, records and head-to-head' },
  { path: '/tours', label: 'Previous tours', description: 'Results and history from every tour' },
  { path: '/info', label: 'Tour information', description: 'Schedule, courses, kit and key notes' },
];
