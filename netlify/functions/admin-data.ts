import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { withAdminSupabase, runRows } from './_adminSupabase';
import { mapBet, mapBetMarket, mapBetOption, mapMatch, mapMatchParticipant, mapPlayer, mapRound, mapTour, mapTourPlayer, mapTourTeam, mapTourTeamMember, mapTourTeamResult } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'GET', async (supabase) => {
  const requestedTourId = event.queryStringParameters?.tourId ?? null;
  const tourRows = await runRows(supabase.from('tours').select('*').order('year', { ascending: false }), 'admin tours');
  const tours = tourRows.map(mapTour);
  const currentTour = tours.find((tour) => tour.isCurrentPublic) ?? tours.find((tour) => tour.status === 'active') ?? tours.find((tour) => tour.status === 'complete') ?? tours[0];
  const selectedTour = (requestedTourId ? tours.find((tour) => tour.id === requestedTourId) : undefined) ?? currentTour;

  const playerRows = await runRows(supabase.from('players').select('*').order('display_name', { ascending: true }), 'admin players');

  if (!selectedTour) {
    return jsonResponse(200, {
      ok: true,
      source: 'supabase',
      selectedTour: undefined,
      currentTour: undefined,
      tours,
      players: playerRows.map(mapPlayer),
      tourPlayers: [],
      tourTeams: [],
      tourTeamMembers: [],
      tourTeamResults: [],
      rounds: [],
      matches: [],
      matchParticipants: [],
      betMarkets: [],
      betOptions: [],
      bets: [],
    });
  }

  const [tourPlayerRows, teamRows, memberRows, roundRows, matchRows, marketRows] = await Promise.all([
    runRows(supabase.from('tour_players').select('*').eq('tour_id', selectedTour.id), 'admin tour players'),
    runRows(supabase.from('tour_teams').select('*').eq('tour_id', selectedTour.id).order('sort_order', { ascending: true }), 'admin tour teams'),
    runRows(supabase.from('tour_team_members').select('*').eq('tour_id', selectedTour.id), 'admin team members'),
    runRows(supabase.from('rounds').select('*').eq('tour_id', selectedTour.id).order('round_number', { ascending: true }), 'admin rounds'),
    runRows(supabase.from('matches').select('*').eq('tour_id', selectedTour.id).order('match_number', { ascending: true }), 'admin matches'),
    runRows(supabase.from('bet_markets').select('*').eq('tour_id', selectedTour.id).order('created_at', { ascending: true }), 'admin bet markets'),
  ]);

  const matchIds = matchRows.map((row) => String(row.id));
  const marketIds = marketRows.map((row) => String(row.id));
  const [resultRows, participantRows, optionRows, betRows] = await Promise.all([
    runRows(supabase.from('tour_team_results').select('*').eq('tour_id', selectedTour.id), 'admin team results').catch((error) => {
      console.warn('Optional tour_team_results admin read failed:', error);
      return [] as Record<string, unknown>[];
    }),
    matchIds.length > 0
      ? runRows(supabase.from('match_participants').select('*').in('match_id', matchIds), 'admin match participants')
      : Promise.resolve([] as Record<string, unknown>[]),
    marketIds.length > 0
      ? runRows(supabase.from('bet_options').select('*').in('market_id', marketIds).order('sort_order', { ascending: true }), 'admin bet options')
      : Promise.resolve([] as Record<string, unknown>[]),
    marketIds.length > 0
      ? runRows(supabase.from('bets').select('*').in('market_id', marketIds).order('created_at', { ascending: true }), 'admin bets')
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  return jsonResponse(200, {
    ok: true,
    source: 'supabase',
    selectedTour,
    currentTour,
    tours,
    players: playerRows.map(mapPlayer),
    tourPlayers: tourPlayerRows.map(mapTourPlayer),
    tourTeams: teamRows.map(mapTourTeam),
    tourTeamMembers: memberRows.map(mapTourTeamMember),
    tourTeamResults: resultRows.map(mapTourTeamResult),
    rounds: roundRows.map(mapRound),
    matches: matchRows.map(mapMatch),
    matchParticipants: participantRows.map(mapMatchParticipant),
    betMarkets: marketRows.map(mapBetMarket),
    betOptions: optionRows.map(mapBetOption),
    bets: betRows.map(mapBet),
  });
});
