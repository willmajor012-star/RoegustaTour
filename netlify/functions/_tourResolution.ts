import type { Tour } from '../../src/lib/types';

const statusRank: Record<Tour['status'], number> = {
  active: 0,
  planned: 1,
  complete: 2,
  archived: 3,
};

function timeValue(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(a: Tour, b: Tour): number {
  return b.year - a.year
    || timeValue(b.startDate) - timeValue(a.startDate)
    || timeValue(b.endDate) - timeValue(a.endDate)
    || a.name.localeCompare(b.name);
}

export function selectDefaultTour(tours: Tour[]): Tour | undefined {
  const explicitTour = tours.filter((tour) => tour.isCurrentPublic === true).sort(newestFirst)[0];
  if (explicitTour) return explicitTour;

  const activeOrUpcomingTour = tours
    .filter((tour) => tour.status === 'active' || tour.status === 'planned')
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || newestFirst(a, b))[0];
  if (activeOrUpcomingTour) return activeOrUpcomingTour;

  return tours
    .filter((tour) => tour.status === 'complete' || tour.status === 'archived')
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || newestFirst(a, b))[0];
}
