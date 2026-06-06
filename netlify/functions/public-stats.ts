type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { calculateAllTimePlayerStats } from '../../src/lib/stats';
import { getStatsBundle, withLiveData } from './_publicData';

export const handler: Handler = async () => withLiveData(async (supabase) => {
  const bundle = await getStatsBundle(supabase);
  return { leaderboard: calculateAllTimePlayerStats(bundle.players, bundle.matches, bundle.matchParticipants, bundle.historicalPlayerStats) };
});
