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
  if (sourceType === 'round' || sourceType === 'retired') return undefined;
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

export function restaurantMapUrl(entry: TourScheduleEntry): string | undefined {
  if (entry.kind !== 'food' || entry.isPlaceholder || !entry.location || !/\b(restaurant|steakhouse)\b/i.test(entry.activity)) return undefined;
  const name = entry.activity.replace(/^dinner at\s+/i, '').trim();
  const query = new URLSearchParams({ api: '1', query: `${name}, ${entry.location}, Portugal` });
  return `https://www.google.com/maps/search/?${query}`;
}

function schedulePosition(entry: TourScheduleEntry, entries: TourScheduleEntry[]) {
  const minutes = (value?: string) => { const clock = itineraryClock(value); if (clock === '99:99') return 9999; const [h, m] = clock.split(':').map(Number); return h * 60 + m; };
  const timed = minutes(entry.timeLabel);
  if (timed !== 9999) return timed;
  const day = entries.filter((e) => e.itemDate === entry.itemDate);
  // Relative labels remain visible as supplied; these anchors only sort cards.
  if (/^on arrival$/i.test(entry.timeLabel ?? '')) {
    const arrival = day.find((e) => e.kind === 'flight' && e.endTimeLabel);
    if (arrival) return minutes(arrival.endTimeLabel) + .01;
  }
  const before = entry.timeLabel?.match(/^before (.+)$/i);
  if (before) {
    const target = day.find((e) => e.id !== entry.id && e.activity.toLowerCase().includes(before[1].toLowerCase()) && minutes(e.timeLabel) !== 9999);
    if (target) return minutes(target.timeLabel) - .01;
  }
  return 9999;
}

function compareScheduleEntries(a: TourScheduleEntry, b: TourScheduleEntry, entries: TourScheduleEntry[]) {
  return (a.itemDate ?? '9999-12-31').localeCompare(b.itemDate ?? '9999-12-31')
    || schedulePosition(a, entries) - schedulePosition(b, entries)
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
  const entries = [...manualEntries, ...golfEntries];
  return entries.sort((a, b) => compareScheduleEntries(a, b, entries));
}
