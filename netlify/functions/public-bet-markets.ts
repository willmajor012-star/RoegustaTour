type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { betMarkets, betOptions, bets } from '../../src/data/mockData';
export const handler: Handler = async () => ({ statusCode: 200, body: JSON.stringify({ betMarkets, betOptions, bets, todo: 'TODO: fetch public betting logs from Supabase.' }) });
