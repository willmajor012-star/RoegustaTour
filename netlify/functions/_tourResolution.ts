import type { Tour } from '../../src/lib/types';

const statusRank: Record<Tour['status'], number> = {
  active: 0,
  planned: 1,
  complete: 2,
  archived: 3,
};

export function selectDefaultTour(tours: Tour[]): Tour | undefined {
  return [...tours].sort((a, b) => {
    const statusDiff = statusRank[a.status] - statusRank[b.status];
    if (statusDiff !== 0) return statusDiff;
    return b.year - a.year;
  })[0];
}
