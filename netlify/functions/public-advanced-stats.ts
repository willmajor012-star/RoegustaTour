type Handler = (event: { httpMethod: string; body: string | null; headers?: Record<string, string | undefined> }) => Promise<{ statusCode: number; body: string }>;

import { calculateMvpLeaderboard, calculatePlayerAdvancedSummaries, calculateTourSummary } from '../../src/lib/advancedStats';
import { getAdvancedStatsBundle, withLiveData } from './_publicData';

export const handler: Handler = async (event) => withLiveData(event, async (supabase) => {
  const bundle = await getAdvancedStatsBundle(supabase);
  const selectedTourId = bundle.currentTour?.id ?? bundle.tours[0]?.id;
  return {
    ...bundle,
    tourSummary: calculateTourSummary(selectedTourId, bundle),
    mvpLeaderboard: calculateMvpLeaderboard(selectedTourId, bundle),
    playerSummaries: calculatePlayerAdvancedSummaries(bundle, selectedTourId),
  };
});
