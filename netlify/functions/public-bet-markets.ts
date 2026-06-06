type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { betMarkets, betOptions, bets } from '../../src/data/mockData';
import { getBettingBundle, withMockFallback } from './_publicData';

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify(
    await withMockFallback(getBettingBundle, { betMarkets, betOptions, bets }),
  ),
});
