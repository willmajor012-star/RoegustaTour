import type { Match, MatchFormat, Round, Tour } from './types';
import { formatDate, formatMatchFormat, formatShortDate } from './formatting';

const CODE_LIKE_PATTERN = /^\s*(?:\d+|[a-f0-9-]{8,}|round[_-]?\d+|import[_-]?.*)\s*$/i;
const SHORT_NOISE = new Set(['tour', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

function cleanText(value?: string | null) {
  const text = value?.trim();
  return text && !CODE_LIKE_PATTERN.test(text) && !SHORT_NOISE.has(text.toLowerCase()) ? text : undefined;
}

export function isPublicVisibleMatch(match: Match) {
  return match.status !== 'draft' && match.status !== 'void' && (match.published !== false || match.status === 'complete');
}

export function formatRoundDisplayName(round?: Round, fallbackIndex?: number) {
  const cleanName = cleanText(round?.name);
  if (cleanName) return cleanName;
  const number = round?.roundNumber || (fallbackIndex !== undefined ? fallbackIndex + 1 : undefined);
  return number ? `Round ${number}` : 'Round';
}

export function formatTourDisplayName(tour?: Tour) {
  const cleanName = cleanText(tour?.name);
  if (cleanName) return cleanName;
  return tour?.year ? `Roegusta Tour ${tour.year}` : 'Roegusta Tour';
}

export function formatTourDates(tour?: Pick<Tour, 'startDate' | 'endDate'>) {
  if (!tour?.startDate && !tour?.endDate) return 'Dates TBC';
  return `${formatDate(tour.startDate)} — ${formatDate(tour.endDate)}`;
}

export function formatRoundMeta(round?: Round, format?: MatchFormat) {
  const parts = [format ? formatMatchFormat(format) : cleanText(round?.formatLabel), cleanText(round?.courseName), formatShortDate(round?.roundDate), cleanText(round?.teeTime)].filter(Boolean);
  return parts.join(' · ') || 'Details TBC';
}

export function formatMatchDisplayLabel(match: Match, round?: Round) {
  const roundLabel = formatRoundDisplayName(round);
  const formatLabel = formatMatchFormat(match.format);
  return `${roundLabel} · ${formatLabel}`;
}

export function normalizeTeeTime(value?: string | null) {
  const match = value?.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return undefined;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

export function getScheduledDate(date?: string, teeTime?: string | null) {
  if (!date) return undefined;
  const normalized = normalizeTeeTime(teeTime) ?? '00:00';
  const value = new Date(`${date}T${normalized}`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}
