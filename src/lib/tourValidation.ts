export function validateTourDateRange(startDate?: string | null, endDate?: string | null): string | null {
  if (!startDate || !endDate) return null;
  return startDate <= endDate ? null : 'Tour end date must be on or after the start date.';
}
