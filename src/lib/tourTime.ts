export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeClockTime(value?: string | null) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function earliestClockTime(values: Array<string | null | undefined>) {
  return values
    .map(normalizeClockTime)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

export function zonedLocalDateTimeToIso(dateValue: string, timeValue: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !isValidTimeZone(timeZone)) return undefined;
  const normalizedTime = normalizeClockTime(timeValue);
  if (!normalizedTime) return undefined;
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = normalizedTime.split(':').map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = targetAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(instant), timeZone);
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const next = instant + (targetAsUtc - representedAsUtc);
    if (next === instant) break;
    instant = next;
  }

  return new Date(instant).toISOString();
}
