import type { Round, Tour } from './types';

// Stableford ranking awards belong to the team scoreboard, never player match
// records. Keep the one-off 2026 restriction out of earlier/future tour rules.
export function countsForPlayerStats(round: Round | undefined, tour: Tour | undefined) {
  if (tour?.rulesVersion !== 'confirmed-2026') return true;
  return round?.competitionRole === 'matchplay' && (round.format === 'better_ball' || round.format === 'singles');
}
