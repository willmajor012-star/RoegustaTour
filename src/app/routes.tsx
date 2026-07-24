import { Admin } from '../pages/Admin';
import { Betting } from '../pages/Betting';
import { CourseGuidePage } from '../pages/CourseGuidePage';
import { Courses } from '../pages/Courses';
import { Dashboard } from '../pages/Dashboard';
import { Matches } from '../pages/Matches';
import { Stats } from '../pages/Stats';
import { Teams } from '../pages/Teams';
import { TourInfo } from '../pages/TourInfo';
import { Tours } from '../pages/Tours';
import { TourScore } from '../pages/TourScore';

export const routes = [
  { path: '/', element: <Dashboard /> },
  { path: '/matches', element: <Matches /> },
  { path: '/teams', element: <Teams /> },
  { path: '/tours', element: <Tours /> },
  { path: '/info', element: <TourInfo /> },
  { path: '/courses', element: <Courses /> },
  { path: '/courses/faldo', element: <CourseGuidePage slug="faldo" /> },
  { path: '/courses/oconnor', element: <CourseGuidePage slug="oconnor" /> },
  { path: '/courses/old-course', element: <CourseGuidePage slug="old-course" /> },
  { path: '/betting', element: <Betting /> },
  { path: '/score', element: <TourScore /> },
  { path: '/stats', element: <Stats /> },
  { path: '/admin', element: <Admin /> },
];
