type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { matchParticipants, matches, rounds } from '../../src/data/mockData';
import { getPublicMatchBundle, withMockFallback } from './_publicData';

const publicMatches = matches.filter((match) => match.published || match.status === 'complete');
const publicMatchIds = new Set(publicMatches.map((match) => match.id));
const publicRoundIds = new Set(publicMatches.map((match) => match.roundId));

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify(
    await withMockFallback(
      getPublicMatchBundle,
      {
        rounds: rounds.filter((round) => publicRoundIds.has(round.id)),
        matches: publicMatches,
        matchParticipants: matchParticipants.filter((participant) => publicMatchIds.has(participant.matchId)),
      },
    ),
  ),
});
