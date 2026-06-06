type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { betMarkets, currentTourId, matches, rounds, tours } from '../../src/data/mockData';

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({ tour: tours.find((tour) => tour.id === currentTourId), rounds, recentResults: matches.filter((match) => match.status === 'complete'), openMarkets: betMarkets.filter((market) => market.status === 'open'), todo: 'TODO: replace mock imports with Supabase reads.' }),
});
