import type { Match } from './types';

export const MATCHPLAY_RESULT_OPTIONS = [
  'AS', '1 Up', '2 Up', '2 & 1', '3 & 2', '3 & 1', '4 & 3', '4 & 2', '5 & 4', '5 & 3',
  '6 & 5', '6 & 4', '7 & 6', '7 & 5', '8 & 7', '8 & 6', '9 & 8', '9 & 7', '10 & 8',
] as const;

export type MatchplayResultCode = typeof MATCHPLAY_RESULT_OPTIONS[number];

const NORMALIZED_TO_LABEL = new Map(MATCHPLAY_RESULT_OPTIONS.map((label) => [label.toLowerCase().replace(/\s+/g, '').replace('&', '&'), label]));

export function normalizeMatchplayResult(value?: string | null): MatchplayResultCode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '').replace('up', 'up');
  if (normalized === 'as') return 'AS';
  const compact = normalized.replace('up', 'up');
  return NORMALIZED_TO_LABEL.get(compact) as MatchplayResultCode | undefined;
}

export function isValidMatchplayResult(value?: string | null): value is MatchplayResultCode {
  return Boolean(normalizeMatchplayResult(value));
}

export function deriveMatchPoints(winningSide: Match['winningSide'] | '' | null | undefined, pointsAvailable = 1) {
  const points = Number.isFinite(pointsAvailable) && pointsAvailable > 0 ? pointsAvailable : 1;
  if (winningSide === 'A') return { pointsSideA: points, pointsSideB: 0 };
  if (winningSide === 'B') return { pointsSideA: 0, pointsSideB: points };
  if (winningSide === 'halved') return { pointsSideA: points / 2, pointsSideB: points / 2 };
  return { pointsSideA: 0, pointsSideB: 0 };
}

export function totalAvailablePoints(matches: Match[]) {
  return matches.filter((match) => match.status !== 'void').reduce((sum, match) => sum + (match.pointsAvailable || 1), 0);
}

export function awardedPoints(matches: Match[]) {
  return matches.filter((match) => match.status === 'complete').reduce((sum, match) => sum + (match.pointsSideA ?? 0) + (match.pointsSideB ?? 0), 0);
}

export function pointsRequiredToWinOutright(totalAvailable: number) {
  return totalAvailable > 0 ? Math.floor(totalAvailable / 2) + 0.5 : undefined;
}
