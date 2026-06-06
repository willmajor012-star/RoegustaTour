type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { players } from '../../src/data/mockData';
import { getPlayersBundle, withMockFallback } from './_publicData';

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify(await withMockFallback(getPlayersBundle, { players })),
});
