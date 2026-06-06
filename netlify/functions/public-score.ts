type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { currentTourId, matches, rounds, tourTeams } from '../../src/data/mockData';
import { calculateTeamScoreByTour } from '../../src/lib/scoring';
import { getScoreBundle, withMockFallback } from './_publicData';

export const handler: Handler = async () => {
  const data = await withMockFallback(
    async (supabase) => {
      const bundle = await getScoreBundle(supabase);
      return { scores: calculateTeamScoreByTour(bundle.tourId, bundle.teams, bundle.rounds, bundle.matches) };
    },
    { scores: calculateTeamScoreByTour(currentTourId, tourTeams, rounds, matches) },
    (data) => data.scores.length === 0,
  );

  return { statusCode: 200, body: JSON.stringify(data) };
};
