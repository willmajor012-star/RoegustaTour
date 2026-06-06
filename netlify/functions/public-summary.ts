type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { betMarkets, currentTourId, matches, rounds, tours } from '../../src/data/mockData';
import { getSummaryBundle, withMockFallback } from './_publicData';

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify(
    await withMockFallback(
      getSummaryBundle,
      {
        tour: tours.find((tour) => tour.id === currentTourId),
        rounds,
        recentResults: matches.filter((match) => match.status === 'complete'),
        openMarkets: betMarkets.filter((market) => market.status === 'open'),
      },
    ),
  ),
});
