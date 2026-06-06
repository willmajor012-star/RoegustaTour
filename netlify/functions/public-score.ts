type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { calculateTeamScoreByTour } from '../../src/lib/scoring';
import { getScoreBundle, withLiveData } from './_publicData';

export const handler: Handler = async () => withLiveData(async (supabase) => {
  const bundle = await getScoreBundle(supabase);
  return { ...bundle, scores: calculateTeamScoreByTour(bundle.tourId, bundle.teams, bundle.rounds, bundle.matches) };
});
