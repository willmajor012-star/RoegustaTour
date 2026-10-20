import type { Match } from '../../src/lib/types';
import { isValidMatchplayResultForHoles, normalizeMatchplayResult } from '../../src/lib/matchplay';

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
  if (!(pointsAvailable > 0) || !Number.isFinite(pointsAvailable)) return 'Points available must be positive.';
  if (pointsSideA !== 0 && pointsSideB !== 0 && pointsSideA !== pointsSideB) return 'Choose a match winner or an equal half for each side.';
  return null;
}

export function validateResultConsistency(resultText: string, pointsSideA: number, pointsSideB: number): string | null {
  const halved = normalizeMatchplayResult(resultText) === 'AS';
  return halved === (pointsSideA === pointsSideB) ? null : 'AS requires a halved match. A winning margin requires a winning side.';
}

export function validateMatchplayResultText(resultText: string, holes?: number | null): string | null {
  return isValidMatchplayResultForHoles(resultText, holes) ? null : 'Choose a valid matchplay result.';
}
