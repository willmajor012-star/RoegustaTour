const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

export function validateTourDateRange(
  startDate?: string | null,
  endDate?: string | null,
  requireBoth = false,
): string | null {
  if (requireBoth && (!startDate || !endDate)) {
    return 'Start date and end date are required for a planned, active or complete tour.';
  }
  if (startDate && !isRealIsoDate(startDate)) return 'Tour start date is invalid.';
  if (endDate && !isRealIsoDate(endDate)) return 'Tour end date is invalid.';
  if (!startDate || !endDate) return null;
  return startDate <= endDate ? null : 'Tour end date must be on or after the start date.';
}
