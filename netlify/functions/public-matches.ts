type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { matchParticipants, matches, rounds } from '../../src/data/mockData';

const publicMatches = matches.filter((match) => match.published || match.status === 'complete');
const publicMatchIds = new Set(publicMatches.map((match) => match.id));

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({
    rounds,
    matches: publicMatches,
    matchParticipants: matchParticipants.filter((participant) => publicMatchIds.has(participant.matchId)),
    todo: 'TODO: fetch published tour matches from Supabase.',
  }),
});
