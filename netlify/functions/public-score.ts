type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { currentTourId, matches, rounds, tourTeams } from '../../src/data/mockData';
import { calculateTeamScoreByTour } from '../../src/lib/scoring';
export const handler: Handler = async () => ({ statusCode: 200, body: JSON.stringify({ scores: calculateTeamScoreByTour(currentTourId, tourTeams, rounds, matches), todo: 'TODO: fetch matches and teams from Supabase.' }) });
