type Handler = () => Promise<{ statusCode: number; body: string }>;

import {
  currentTourId,
  matchParticipants,
  matches,
  playerMatchResults,
  players,
  rounds,
  tours,
  tourTeamMembers,
  tourTeamResults,
  tourTeams,
} from '../../src/data/mockData';
import { calculateMvpLeaderboard, calculatePlayerAdvancedSummaries, calculateTourSummary } from '../../src/lib/advancedStats';
import { getAdvancedStatsBundle, withMockFallback } from './_publicData';

const mockBundle = {
  currentTour: tours.find((tour) => tour.id === currentTourId),
  players,
  tours,
  tourTeams,
  tourTeamMembers,
  tourTeamResults,
  rounds,
  matches,
  matchParticipants,
  playerMatchResults,
};

function withDerivedStats(bundle: typeof mockBundle) {
  const selectedTourId = bundle.currentTour?.id ?? bundle.tours[0]?.id;
  return {
    ...bundle,
    tourSummary: calculateTourSummary(selectedTourId, bundle),
    mvpLeaderboard: calculateMvpLeaderboard(selectedTourId, bundle),
    playerSummaries: calculatePlayerAdvancedSummaries(bundle, selectedTourId),
  };
}

export const handler: Handler = async () => {
  const data = await withMockFallback(
    async (supabase) => withDerivedStats(await getAdvancedStatsBundle(supabase)),
    withDerivedStats(mockBundle),
  );

  return { statusCode: 200, body: JSON.stringify(data) };
};
