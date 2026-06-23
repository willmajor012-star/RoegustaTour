import type { Match } from './types';

export function tourPointsTarget(matches: Match[]) {
  const totalAvailablePoints = matches
    .filter((match) => match.status !== 'void' && match.winningSide !== 'void')
    .reduce((sum, match) => sum + (Number.isFinite(match.pointsAvailable) ? match.pointsAvailable : 1), 0);
  return {
    totalAvailablePoints,
    pointsToWin: totalAvailablePoints > 0 ? Math.floor(totalAvailablePoints / 2) + 0.5 : 0,
  };
}
