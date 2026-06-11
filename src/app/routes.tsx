import { Admin } from '../pages/Admin';
import { Betting } from '../pages/Betting';
import { Dashboard } from '../pages/Dashboard';
import { Matches } from '../pages/Matches';
import { Players } from '../pages/Players';
import { Stats } from '../pages/Stats';
import { Teams } from '../pages/Teams';
import { TourInfo } from '../pages/TourInfo';
import { Tours } from '../pages/Tours';
import { TourScore } from '../pages/TourScore';

export const routes = [
  { path: '/', element: <Dashboard /> },
  { path: '/matches', element: <Matches /> },
  { path: '/teams', element: <Teams /> },
  { path: '/players', element: <Players /> },
  { path: '/tours', element: <Tours /> },
  { path: '/info', element: <TourInfo /> },
  { path: '/betting', element: <Betting /> },
  { path: '/score', element: <TourScore /> },
  { path: '/stats', element: <Stats /> },
  { path: '/admin', element: <Admin /> },
];
