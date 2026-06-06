type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { historicalPlayerStats, matchParticipants, matches, players } from '../../src/data/mockData';
import { calculateAllTimePlayerStats } from '../../src/lib/stats';
export const handler: Handler = async () => ({ statusCode: 200, body: JSON.stringify({ leaderboard: calculateAllTimePlayerStats(players, matches, matchParticipants, historicalPlayerStats), todo: 'TODO: derive stats from Supabase match rows plus historic imports.' }) });
