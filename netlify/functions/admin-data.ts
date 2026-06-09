import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { withAdminSupabase, runRows } from './_adminSupabase';
import { mapPlayer, mapTour, mapTourPlayer, mapTourTeam, mapTourTeamMember, mapTourTeamResult } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'GET', async (supabase) => {
  const tourRows = await runRows(supabase.from('tours').select('*').order('year', { ascending: false }), 'admin tours');
  const tours = tourRows.map(mapTour);
  const currentTour = tours[0];

  const playerRows = await runRows(supabase.from('players').select('*').order('display_name', { ascending: true }), 'admin players');

  if (!currentTour) {
    return jsonResponse(200, {
      ok: true,
      source: 'supabase',
      currentTour: undefined,
      tours,
      players: playerRows.map(mapPlayer),
      tourPlayers: [],
      tourTeams: [],
      tourTeamMembers: [],
      tourTeamResults: [],
    });
  }

  const [tourPlayerRows, teamRows, memberRows] = await Promise.all([
    runRows(supabase.from('tour_players').select('*').eq('tour_id', currentTour.id), 'admin tour players'),
    runRows(supabase.from('tour_teams').select('*').eq('tour_id', currentTour.id).order('sort_order', { ascending: true }), 'admin tour teams'),
    runRows(supabase.from('tour_team_members').select('*').eq('tour_id', currentTour.id), 'admin team members'),
  ]);

  let resultRows: Record<string, unknown>[] = [];
  try {
    resultRows = await runRows(supabase.from('tour_team_results').select('*').eq('tour_id', currentTour.id), 'admin team results');
  } catch (error) {
    console.warn('Optional tour_team_results admin read failed:', error);
  }

  return jsonResponse(200, {
    ok: true,
    source: 'supabase',
    currentTour,
    tours,
    players: playerRows.map(mapPlayer),
    tourPlayers: tourPlayerRows.map(mapTourPlayer),
    tourTeams: teamRows.map(mapTourTeam),
    tourTeamMembers: memberRows.map(mapTourTeamMember),
    tourTeamResults: resultRows.map(mapTourTeamResult),
  });
});
