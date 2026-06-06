type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { currentTourId, matches, rounds, tourTeams, tours } from '../../src/data/mockData';
import { calculateTeamScoreByTour } from '../../src/lib/scoring';
import { getScoreBundle, withMockFallback } from './_publicData';

export const handler: Handler = async () => {
  const data = await withMockFallback(
    async (supabase) => {
      const bundle = await getScoreBundle(supabase);
      return { ...bundle, scores: calculateTeamScoreByTour(bundle.tourId, bundle.teams, bundle.rounds, bundle.matches) };
    },
    {
      tour: tours.find((tour) => tour.id === currentTourId),
      tourId: currentTourId,
      teams: tourTeams.filter((team) => team.tourId === currentTourId),
      rounds: rounds.filter((round) => round.tourId === currentTourId),
      matches: matches.filter((match) => match.tourId === currentTourId && match.status === 'complete'),
      scores: calculateTeamScoreByTour(currentTourId, tourTeams, rounds, matches),
    },
  );

  return { statusCode: 200, body: JSON.stringify(data) };
};
