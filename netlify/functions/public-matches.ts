type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { matchParticipants, matches, rounds } from '../../src/data/mockData';
export const handler: Handler = async () => ({ statusCode: 200, body: JSON.stringify({ rounds, matches, matchParticipants, todo: 'TODO: fetch tour matches from Supabase.' }) });
