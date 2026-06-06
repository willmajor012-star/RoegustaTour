type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { currentTourId, matchParticipants, matches, players, rounds, tourTeams, tours } from '../../src/data/mockData';
import { getPublicMatchBundle, withMockFallback } from './_publicData';

const publicMatches = matches.filter((match) => match.tourId === currentTourId && (match.published || match.status === 'complete'));
const publicMatchIds = new Set(publicMatches.map((match) => match.id));
const publicRoundIds = new Set(publicMatches.map((match) => match.roundId));

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify(
    await withMockFallback(
      getPublicMatchBundle,
      {
        tour: tours.find((tour) => tour.id === currentTourId),
        rounds: rounds.filter((round) => publicRoundIds.has(round.id)),
        matches: publicMatches,
        matchParticipants: matchParticipants.filter((participant) => publicMatchIds.has(participant.matchId)),
        players,
        tourTeams: tourTeams.filter((team) => team.tourId === currentTourId),
      },
    ),
  ),
});
