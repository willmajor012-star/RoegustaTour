import type { TourItineraryItem } from './publicApi';
import type { Round } from './types';

export const manualItineraryKinds = ['flight', 'travel', 'accommodation', 'food', 'activity'] as const;
export type ManualItineraryKind = typeof manualItineraryKinds[number];

export const manualItineraryKindLabels: Record<ManualItineraryKind, string> = {
  flight: 'Flight',
  travel: 'Travel / transfer',
  accommodation: 'Accommodation',
  food: 'Food & drink',
  activity: 'Activity / information',
};

const sourceAliases: Record<string, ManualItineraryKind> = {
  travel: 'travel',
  flight: 'flight',
  flights: 'flight',
  transfer: 'travel',
  flights_travel: 'flight',
  accommodation: 'accommodation',
  hotel: 'accommodation',
  stay: 'accommodation',
  food: 'food',
  meal: 'food',
  dinner: 'food',
  dinner_social: 'food',
  restaurant: 'food',
  activity: 'activity',
  information: 'activity',
  social: 'activity',
};

const activityPatterns: Array<[ManualItineraryKind, RegExp]> = [
  ['flight', /\bflight\b/i],
  ['travel', /\b(airport|arrival|depart(?:ure)?|travel|transfer|coach|minibus|train|carriages)\b/i],
  ['accommodation', /\b(accommodation|hotel|check[ -]?(?:in|out)|rooms?|villa)\b/i],
  ['food', /\b(breakfast|brunch|lunch|dinner|drinks?|restaurant|supper|meal)\b/i],
  ['activity', /\b(activity|meet|meeting|announcement|padel|information)\b/i],
];

export function manualItineraryKind(item: Pick<TourItineraryItem, 'activity' | 'sourceType'>): ManualItineraryKind | undefined {
  const sourceType = item.sourceType?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? '';
  if (sourceType === 'round') return undefined;
  if (sourceType === 'travel' && /\bflight\b/i.test(item.activity)) return 'flight';
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
  endTimeLabel?: string;
  activity: string;
  location?: string;
  notes?: string;
  isPlaceholder: boolean;
  sortOrder: number;
  kind: ManualItineraryKind | 'golf';
  roundNumber?: number;
  courseId?: string;
};

export function itineraryClock(value?: string | null) {
  const clock = value?.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  return clock ? `${clock[1]}:${clock[2]}` : '99:99';
}

export function formatItineraryTime(value?: string | null) {
  const clock = value?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!clock) return value || 'TBC';
  const hour = Number(clock[1]);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${clock[2]}${suffix}`;
}

function compareScheduleEntries(a: TourScheduleEntry, b: TourScheduleEntry) {
  return (a.itemDate ?? '9999-12-31').localeCompare(b.itemDate ?? '9999-12-31')
    || itineraryClock(a.timeLabel).localeCompare(itineraryClock(b.timeLabel))
    || a.sortOrder - b.sortOrder
    || a.activity.localeCompare(b.activity);
}

function roundItineraryNotes(notes?: string) {
  const publicNotes = notes?.replace(/\[Session:\s*(?:AM|PM)\]\s*/gi, '').trim();
  return publicNotes || undefined;
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
      notes: roundItineraryNotes(round.notes),
      isPlaceholder: !round.teeTime || !round.courseName,
      sortOrder: round.roundNumber,
      kind: 'golf' as const,
      roundNumber: round.roundNumber,
      courseId: round.courseId,
    }));
  return [...manualEntries, ...golfEntries].sort(compareScheduleEntries);
}
