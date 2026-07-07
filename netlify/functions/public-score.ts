type Handler = (event: { httpMethod: string; body: string | null; headers?: Record<string, string | undefined> }) => Promise<{ statusCode: number; body: string }>;
import { calculateTeamScoreByTour } from '../../src/lib/scoring';
import { getScoreBundle, withLiveData } from './_publicData';

export const handler: Handler = async (event) => withLiveData(event, async (supabase) => {
  const bundle = await getScoreBundle(supabase);
  return { ...bundle, scores: calculateTeamScoreByTour(bundle.tourId, bundle.teams, bundle.rounds, bundle.matches) };
});
