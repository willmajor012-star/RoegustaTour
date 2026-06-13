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
  const parts = [format ? formatMatchFormat(format) : cleanText(round?.formatLabel), cleanText(round?.courseName), formatShortDate(round?.roundDate), normalizeTeeTime(round?.teeTime)].filter(Boolean);
  return parts.join(' · ') || 'Details TBC';
}

export function formatMatchDisplayLabel(match: Match, round?: Round) {
  const roundLabel = formatRoundDisplayName(round);
  const formatLabel = formatMatchFormat(match.format);
  return `${roundLabel} · ${formatLabel}`;
}

export function normalizeTeeTime(value?: string | null) {
  const text = value?.trim();
  if (!text) return undefined;
  const match = text.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}


export function formatTeeTimeDisplay(value?: string | null, fallback = 'Tee time TBC') {
  const text = value?.trim();
  if (!text) return fallback;
  if (/^tbc$/i.test(text)) return 'TBC';
  return normalizeTeeTime(text) ?? text;
}

export function compareTeeTimeValues(left?: string | null, right?: string | null) {
  const leftTime = normalizeTeeTime(left);
  const rightTime = normalizeTeeTime(right);
  if (leftTime && rightTime) return leftTime.localeCompare(rightTime);
  if (leftTime) return -1;
  if (rightTime) return 1;
  return 0;
}

export function publicWorkflowStatusLabel(status?: string) {
  if (status === 'active') return 'Live';
  if (status === 'complete' || status === 'archived') return 'Final';
  return undefined;
}

export function getDateOnlyScheduledDate(date?: string, time = '00:00') {
  if (!date) return undefined;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

export function getScheduledDate(date?: string, teeTime?: string | null) {
  if (!date) return undefined;
  const normalized = normalizeTeeTime(teeTime);
  if (!normalized) return undefined;
  const value = new Date(`${date}T${normalized}`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

export function getScheduleSortTime(date?: string, teeTime?: string | null) {
  const scheduled = getScheduledDate(date, teeTime);
  if (scheduled) return scheduled.getTime();
  const endOfDay = getDateOnlyScheduledDate(date, '23:59:59');
  return endOfDay?.getTime() ?? Number.MAX_SAFE_INTEGER;
}
