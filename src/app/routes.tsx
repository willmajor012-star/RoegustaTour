import { Admin } from '../pages/Admin';
import { Betting } from '../pages/Betting';
import { Dashboard } from '../pages/Dashboard';
import { Matches } from '../pages/Matches';
import { Players } from '../pages/Players';
import { Stats } from '../pages/Stats';
import { TourInfo } from '../pages/TourInfo';
import { TourScore } from '../pages/TourScore';

export const routes = [
  { path: '/', element: <Dashboard /> },
  { path: '/score', element: <TourScore /> },
  { path: '/matches', element: <Matches /> },
  { path: '/stats', element: <Stats /> },
  { path: '/players', element: <Players /> },
  { path: '/betting', element: <Betting /> },
  { path: '/info', element: <TourInfo /> },
  { path: '/admin', element: <Admin /> },
];
