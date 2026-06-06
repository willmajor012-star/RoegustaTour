type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { currentTourId, rounds, tours, tourTeams } from '../../src/data/mockData';
import type { PublicTourInfoResponse } from '../../src/lib/publicApi';
import { getTourInfoBundle, withMockFallback } from './_publicData';

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify(
    await withMockFallback(
      getTourInfoBundle,
      {
        tour: tours.find((tour) => tour.id === currentTourId),
        rounds: rounds.filter((round) => round.tourId === currentTourId),
        handbookSections: [],
        itineraryItems: [],
        teamDayKit: [],
        tourTeams: tourTeams.filter((team) => team.tourId === currentTourId),
      } as Omit<PublicTourInfoResponse, 'source'>,
    ),
  ),
});
