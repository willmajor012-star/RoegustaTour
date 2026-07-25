import type { TourItineraryItem } from './publicApi';
import type { Round } from './types';

export const manualItineraryKinds = ['travel', 'accommodation', 'dinner'] as const;
export type ManualItineraryKind = typeof manualItineraryKinds[number];

export const manualItineraryKindLabels: Record<ManualItineraryKind, string> = {
  travel: 'Flight / travel',
  accommodation: 'Accommodation',
  dinner: 'Dinner',
};

const sourceAliases: Record<string, ManualItineraryKind> = {
  travel: 'travel',
  flight: 'travel',
  flights: 'travel',
  transfer: 'travel',
  flights_travel: 'travel',
  accommodation: 'accommodation',
  hotel: 'accommodation',
  stay: 'accommodation',
  dinner: 'dinner',
  dinner_social: 'dinner',
  restaurant: 'dinner',
};

const activityPatterns: Array<[ManualItineraryKind, RegExp]> = [
  ['travel', /\b(flight|airport|arrival|depart(?:ure)?|travel|transfer|coach|minibus|train)\b/i],
  ['accommodation', /\b(accommodation|hotel|check[ -]?(?:in|out)|rooms?|villa)\b/i],
  ['dinner', /\b(dinner|restaurant|supper|evening meal)\b/i],
];

export function manualItineraryKind(item: Pick<TourItineraryItem, 'activity' | 'sourceType'>): ManualItineraryKind | undefined {
  const sourceType = item.sourceType?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? '';
  if (sourceType === 'round') return undefined;
  const direct = sourceAliases[sourceType];
  if (direct) return direct;
  return activityPatterns.find(([, pattern]) => pattern.test(item.activity))?.[0];
}

export function activeManualItineraryItems(items: TourItineraryItem[], tourId?: string) {
  return items
    .filter((item) => !tourId || item.tourId === tourId)
    .filter((item) => manualItineraryKind(item))
    .sort((a, b) => (
      (a.itemDate ?? '').localeCompare(b.itemDate ?? '')
      || itineraryClock(a.timeLabel).localeCompare(itineraryClock(b.timeLabel))
      || a.sortOrder - b.sortOrder
      || a.activity.localeCompare(b.activity)
    ));
}

export type TourScheduleEntry = {
  id: string;
  tourId: string;
  itemDate?: string;
  dayLabel?: string;
  timeLabel?: string;
  activity: string;
  location?: string;
  notes?: string;
  isPlaceholder: boolean;
  sortOrder: number;
  kind: ManualItineraryKind | 'golf';
  roundNumber?: number;
  courseId?: string;
};

function itineraryClock(value?: string | null) {
  const clock = value?.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  return clock ? `${clock[1]}:${clock[2]}` : '99:99';
}

function compareScheduleEntries(a: TourScheduleEntry, b: TourScheduleEntry) {
  return (a.itemDate ?? '9999-12-31').localeCompare(b.itemDate ?? '9999-12-31')
    || itineraryClock(a.timeLabel).localeCompare(itineraryClock(b.timeLabel))
    || a.sortOrder - b.sortOrder
    || a.activity.localeCompare(b.activity);
}

export function buildTourSchedule(tourId: string, rounds: Round[], items: TourItineraryItem[]): TourScheduleEntry[] {
  const manualEntries = activeManualItineraryItems(items, tourId).map((item) => ({
    ...item,
    kind: manualItineraryKind(item) as ManualItineraryKind,
  }));
  const golfEntries = rounds
    .filter((round) => round.tourId === tourId)
    .map((round) => ({
      id: `round-${round.id}`,
      tourId,
      itemDate: round.roundDate,
      timeLabel: round.teeTime,
      activity: round.name || `Round ${round.roundNumber}`,
      location: round.courseName,
      isPlaceholder: !round.teeTime || !round.courseName,
      sortOrder: round.roundNumber,
      kind: 'golf' as const,
      roundNumber: round.roundNumber,
      courseId: round.courseId,
    }));
  return [...manualEntries, ...golfEntries].sort(compareScheduleEntries);
}
