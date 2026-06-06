type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { players } from '../../src/data/mockData';
export const handler: Handler = async () => ({ statusCode: 200, body: JSON.stringify({ players, todo: 'TODO: fetch permanent players from Supabase.' }) });
