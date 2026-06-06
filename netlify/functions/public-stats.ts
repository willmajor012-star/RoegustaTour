type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { historicalPlayerStats, matchParticipants, matches, players } from '../../src/data/mockData';
import { calculateAllTimePlayerStats } from '../../src/lib/stats';
import { getStatsBundle, withMockFallback } from './_publicData';

export const handler: Handler = async () => {
  const data = await withMockFallback(
    async (supabase) => {
      const bundle = await getStatsBundle(supabase);
      return { leaderboard: calculateAllTimePlayerStats(bundle.players, bundle.matches, bundle.matchParticipants, bundle.historicalPlayerStats) };
    },
    { leaderboard: calculateAllTimePlayerStats(players, matches, matchParticipants, historicalPlayerStats) },
  );

  return { statusCode: 200, body: JSON.stringify(data) };
};
