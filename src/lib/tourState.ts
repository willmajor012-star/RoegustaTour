import type { Tour } from './types';
import { zonedLocalDateTimeToIso } from './tourTime';

export function tourLifecycle(tour?: Pick<Tour, 'startDate' | 'endDate' | 'timezone' | 'status'>, now = Date.now()) {
  const timezone = tour?.timezone ?? 'Europe/Lisbon';
  const startIso = tour?.startDate ? zonedLocalDateTimeToIso(tour.startDate, '00:00', timezone) : undefined;
  const endIso = tour?.endDate ? zonedLocalDateTimeToIso(tour.endDate, '23:59', timezone) : undefined;
  const start = startIso ? new Date(startIso) : undefined;
  const end = endIso ? new Date(Date.parse(endIso) + 59_999) : undefined;
  const complete = tour?.status === 'complete' || tour?.status === 'archived' || Boolean(end && now > end.getTime());
  const live = !complete && (start ? now >= start.getTime() : tour?.status === 'active');
  return { start, end, complete, live };
}
