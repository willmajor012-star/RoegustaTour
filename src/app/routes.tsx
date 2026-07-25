import type { ReactNode } from 'react';
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

export type AppRoute = {
  path: string;
  element: ReactNode;
  matches?: (pathname: string) => boolean;
};

export const routes: AppRoute[] = [
  { path: '/', element: <Dashboard /> },
  { path: '/matches', element: <Matches /> },
  { path: '/teams', element: <Teams /> },
  { path: '/tours', element: <Tours /> },
  { path: '/info', element: <TourInfo /> },
  { path: '/courses', element: <Courses /> },
  { path: '/courses/:slug', matches: (pathname) => /^\/courses\/[^/]+$/.test(pathname), element: <CourseGuidePage /> },
  { path: '/betting', element: <Betting /> },
  { path: '/score', element: <TourScore /> },
  { path: '/stats', element: <Stats /> },
  { path: '/admin', element: <Admin /> },
];

export function routeForPath(pathname: string) {
  return routes.find((route) => route.path === pathname || route.matches?.(pathname)) ?? routes[0];
}

export function isRoutePath(pathname: string) {
  return routes.some((route) => route.path === pathname || route.matches?.(pathname));
}
