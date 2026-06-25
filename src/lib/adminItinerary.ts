import type { Round } from './types';
import type { TourItineraryItem } from './publicApi';

export type DraftItineraryPayload = {
  itemDate?: string | null;
  dayLabel?: string | null;
  timeLabel?: string | null;
  activity: string;
  location?: string | null;
  notes?: string | null;
  isPlaceholder: boolean;
  sortOrder: number;
};

export const roundItinerarySourceToken = (roundId: string) => `[round:${roundId}]`;

const normalizeOrder = (items: TourItineraryItem[]) => [...items]
  .sort((a, b) => a.sortOrder - b.sortOrder || (a.itemDate ?? '').localeCompare(b.itemDate ?? '') || a.activity.localeCompare(b.activity) || a.id.localeCompare(b.id))
  .map((item, index) => ({ ...item, sortOrder: index + 1 }));

export function reorderItineraryItems(items: TourItineraryItem[], itemId: string, direction: -1 | 1): TourItineraryItem[] {
  const ordered = normalizeOrder(items);
  const index = ordered.findIndex((item) => item.id === itemId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return ordered;
  const moved = [...ordered];
  [moved[index], moved[targetIndex]] = [moved[targetIndex], moved[index]];
  return moved.map((item, nextIndex) => ({ ...item, sortOrder: nextIndex + 1 }));
}

function itineraryItemReferencesRound(item: TourItineraryItem, round: Round): boolean {
  const token = roundItinerarySourceToken(round.id);
  if (item.notes?.includes(token)) return true;
  return Boolean(item.itemDate && round.roundDate && item.itemDate === round.roundDate && item.activity.trim().toLowerCase() === (round.name || `Round ${round.roundNumber}`).trim().toLowerCase());
}

export function buildMissingRoundItineraryDrafts(existingItems: TourItineraryItem[], rounds: Round[]): DraftItineraryPayload[] {
  const ordered = normalizeOrder(existingItems);
  const baseOrder = ordered.length;
  return rounds
    .filter((round) => round.roundDate)
    .filter((round) => !ordered.some((item) => itineraryItemReferencesRound(item, round)))
    .map((round, index) => {
      const sourceToken = roundItinerarySourceToken(round.id);
      const notes = [sourceToken, round.formatLabel].filter(Boolean).join(' ');
      return {
        itemDate: round.roundDate ?? null,
        dayLabel: null,
        timeLabel: round.teeTime || 'TBC',
        activity: round.name || `Round ${round.roundNumber}`,
        location: round.courseName || 'Course TBC',
        notes: notes || sourceToken,
        isPlaceholder: !round.teeTime || !round.courseName,
        sortOrder: baseOrder + index + 1,
      };
    });
}
