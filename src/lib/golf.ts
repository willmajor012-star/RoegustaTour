import type { Match } from './types';

export function tourPointsTarget(matches: Match[], projectedTotalPoints = 0) {
  const ledgerPoints = matches
    .filter((match) => match.status !== 'void' && match.winningSide !== 'void')
    .reduce((sum, match) => sum + (Number.isFinite(match.pointsAvailable) ? match.pointsAvailable : 1), 0);
  const totalAvailablePoints = Math.max(ledgerPoints, Number.isFinite(projectedTotalPoints) ? projectedTotalPoints : 0);
  return {
    totalAvailablePoints,
    pointsToWin: totalAvailablePoints > 0 ? Math.floor(totalAvailablePoints + 1) / 2 : 0,
  };
}
