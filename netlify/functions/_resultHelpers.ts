import type { Match } from '../../src/lib/types';

export function deriveWinningSide(pointsSideA: number, pointsSideB: number): NonNullable<Match['winningSide']> {
  if (pointsSideA > pointsSideB) return 'A';
  if (pointsSideB > pointsSideA) return 'B';
  return 'halved';
}

export function playerResultForSide(side: 'A' | 'B', winningSide: NonNullable<Match['winningSide']>): 'win' | 'draw' | 'loss' {
  if (winningSide === 'halved') return 'draw';
  return winningSide === side ? 'win' : 'loss';
}

export function validateResultPoints(pointsSideA: number, pointsSideB: number, pointsAvailable: number): string | null {
  if (!Number.isFinite(pointsSideA) || !Number.isFinite(pointsSideB)) return 'Result points must be numeric.';
  if (pointsSideA < 0 || pointsSideB < 0) return 'Result points must be zero or greater.';
  if (Math.abs(pointsSideA + pointsSideB - pointsAvailable) > 0.001) return 'Result points must add up to the points available.';
  return null;
}
