type Handler = (event: { httpMethod: string; body: string | null; headers?: Record<string, string | undefined> }) => Promise<{ statusCode: number; body: string }>;
import { calculateAllTimePlayerStats } from '../../src/lib/stats';
import { getStatsBundle, withLiveData } from './_publicData';

export const handler: Handler = async (event) => withLiveData(event, async (supabase) => {
  const bundle = await getStatsBundle(supabase);
  return { leaderboard: calculateAllTimePlayerStats(bundle.players, bundle.matches, bundle.matchParticipants, bundle.historicalPlayerStats) };
});
