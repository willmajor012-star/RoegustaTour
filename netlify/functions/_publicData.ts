import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './_supabase';
import { mapBet, mapBetMarket, mapBetOption, mapHistoricalPlayerStats, mapMatch, mapMatchParticipant, mapPlayer, mapPlayerMatchResult, mapRound, mapTour, mapTourHandbookSection, mapTourItineraryItem, mapTourPlayer, mapTourTeam, mapTourTeamDayKit, mapTourTeamMember, mapTourTeamResult } from './_mappers';
import { selectDefaultTour } from './_tourResolution';

type SupabaseResult<T> = { data: T[] | null; error: { message: string } | null };
type QueryBuilder<T = Record<string, unknown>> = PromiseLike<SupabaseResult<T>> & {
  select(columns?: string): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  or(filters: string): QueryBuilder<T>;
};

async function runQuery<T>(query: QueryBuilder<T>, label: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? [];
}

function table<T = Record<string, unknown>>(supabase: SupabaseClient, name: string): QueryBuilder<T> {
  return supabase.from(name) as unknown as QueryBuilder<T>;
}

export async function withLiveData<T extends object>(read: (supabase: SupabaseClient) => Promise<T>): Promise<{ statusCode: number; body: string }> {
  try {
    const supabase = createServerSupabaseClient();
    const data = await read(supabase);
    return { statusCode: 200, body: JSON.stringify({ ...data, source: 'supabase' }) };
  } catch (error) {
    console.error('Public live data request failed:', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Live data unavailable' }) };
  }
}

export async function getCurrentTour(supabase: SupabaseClient) {
  const tours = (await runQuery(table(supabase, 'tours').select('*').order('year', { ascending: false }), 'tours')).map(mapTour);
  return selectDefaultTour(tours);
}

export async function getPublicMatchBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [], tourTeamMembers: [] };

  const publicMatches = (await runQuery(
    table(supabase, 'matches')
      .select('*')
      .eq('tour_id', tour.id)
      .or('published.eq.true,status.eq.complete')
      .order('match_number', { ascending: true }),
    'public matches',
  )).map(mapMatch);

  const publicMatchIds = publicMatches.map((match) => match.id);
  const publicRoundIds = new Set(publicMatches.map((match) => match.roundId));

  const [roundRows, participantRows, playerRows, teamRows, memberRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'public rounds'),
    publicMatchIds.length > 0 ? runQuery(table(supabase, 'match_participants').select('*').in('match_id', publicMatchIds), 'public match participants') : Promise.resolve([]),
    runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'public players'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'public tour teams'),
    runQuery(table(supabase, 'tour_team_members').select('*').eq('tour_id', tour.id), 'public tour team members'),
  ]);

  return {
    tour,
    rounds: roundRows.filter((round) => round.status !== 'draft' || publicRoundIds.has(String(round.id))).map(mapRound),
    matches: publicMatches,
    matchParticipants: participantRows.map(mapMatchParticipant),
    players: playerRows.map(mapPlayer),
    tourTeams: teamRows.map(mapTourTeam),
    tourTeamMembers: memberRows.map(mapTourTeamMember),
  };
}

export async function getScoreBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, tourId: '', teams: [], rounds: [], matches: [] };

  const [teamRows, roundRows, matchRows] = await Promise.all([
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour teams'),
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'rounds'),
    runQuery(
      table(supabase, 'matches')
        .select('*')
        .eq('tour_id', tour.id)
        .or('published.eq.true,status.eq.complete')
        .order('match_number', { ascending: true }),
      'public score matches',
    ),
  ]);

  return {
    tour,
    tourId: tour.id,
    teams: teamRows.map(mapTourTeam),
    rounds: roundRows.map(mapRound),
    matches: matchRows.map(mapMatch),
  };
}

export async function getPlayersBundle(supabase: SupabaseClient) {
  return { players: (await runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'players')).map(mapPlayer) };
}

export async function getStatsBundle(supabase: SupabaseClient) {
  const [playerRows, matchRows, participantRows, historicalRows] = await Promise.all([
    runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'players'),
    runQuery(table(supabase, 'matches').select('*').eq('status', 'complete'), 'complete matches'),
    runQuery(
      table(supabase, 'match_participants')
        .select('*, matches!inner(status)')
        .eq('matches.status', 'complete'),
      'match participants',
    ),
    runQuery(table(supabase, 'historical_player_stats').select('*'), 'historical player stats'),
  ]);

  return {
    players: playerRows.map(mapPlayer),
    matches: matchRows.map(mapMatch),
    matchParticipants: participantRows.map(mapMatchParticipant),
    historicalPlayerStats: historicalRows.map(mapHistoricalPlayerStats),
  };
}


export async function getAdvancedStatsBundle(supabase: SupabaseClient) {
  const currentTour = await getCurrentTour(supabase);
  const [playerRows, tourRows, teamRows, tourPlayerRows, memberRows, resultRows, roundRows, completedMatchRows, currentPublicMatchRows] = await Promise.all([
    runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'players'),
    runQuery(table(supabase, 'tours').select('*').order('year', { ascending: false }), 'tours'),
    runQuery(table(supabase, 'tour_teams').select('*').order('sort_order', { ascending: true }), 'tour teams'),
    runQuery(table(supabase, 'tour_players').select('*'), 'tour players'),
    runQuery(table(supabase, 'tour_team_members').select('*'), 'tour team members'),
    runQuery(table(supabase, 'tour_team_results').select('*'), 'tour team results'),
    runQuery(table(supabase, 'rounds').select('*').order('round_number', { ascending: true }), 'rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('status', 'complete').order('match_number', { ascending: true }), 'completed matches'),
    currentTour
      ? runQuery(table(supabase, 'matches').select('*').eq('tour_id', currentTour.id).eq('published', true).order('match_number', { ascending: true }), 'current public matches')
      : Promise.resolve([]),
  ]);

  const matchById = new Map([...completedMatchRows, ...currentPublicMatchRows].map((row) => [String(row.id), row]));
  const matchIds = [...matchById.keys()];
  const [participantRows, playerResultRows] = matchIds.length > 0
    ? await Promise.all([
      runQuery(table(supabase, 'match_participants').select('*').in('match_id', matchIds), 'match participants'),
      runQuery(table(supabase, 'player_match_results').select('*').in('match_id', matchIds), 'player match results'),
    ])
    : [[], []];

  return {
    currentTour,
    players: playerRows.map(mapPlayer),
    tours: tourRows.map(mapTour),
    tourTeams: teamRows.map(mapTourTeam),
    tourPlayers: tourPlayerRows.map(mapTourPlayer),
    tourTeamMembers: memberRows.map(mapTourTeamMember),
    tourTeamResults: resultRows.map(mapTourTeamResult),
    rounds: roundRows.map(mapRound),
    matches: [...matchById.values()].map(mapMatch),
    matchParticipants: participantRows.map(mapMatchParticipant),
    playerMatchResults: playerResultRows.map(mapPlayerMatchResult),
  };
}

export async function getBettingBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { rounds: [], players: [], tourPlayers: [], betMarkets: [], betOptions: [], bets: [] };

  const [roundRows, playerRows, tourPlayerRows, marketRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'bet rounds'),
    runQuery(table(supabase, 'players').select('*').eq('active', true).order('display_name', { ascending: true }), 'bet players'),
    runQuery(table(supabase, 'tour_players').select('*').eq('tour_id', tour.id), 'bet tour players'),
    runQuery(table(supabase, 'bet_markets').select('*').eq('tour_id', tour.id).order('created_at', { ascending: true }), 'bet markets'),
  ]);
  const visibleMarketRows = marketRows.filter((market) => String(market.status) !== 'void');
  const marketIds = visibleMarketRows.map((market) => String(market.id));
  const marketRoundIds = new Set(visibleMarketRows.map((market) => String(market.round_id ?? '')).filter(Boolean));

  const [optionRows, betRows] = await Promise.all([
    marketIds.length > 0 ? runQuery(table(supabase, 'bet_options').select('*').in('market_id', marketIds).order('sort_order', { ascending: true }), 'bet options') : Promise.resolve([]),
    marketIds.length > 0 ? runQuery(table(supabase, 'bets').select('*').in('market_id', marketIds).order('created_at', { ascending: true }), 'bets') : Promise.resolve([]),
  ]);

  return {
    rounds: roundRows.filter((round) => round.status !== 'draft' || marketRoundIds.has(String(round.id))).map(mapRound),
    players: playerRows.map(mapPlayer),
    tourPlayers: tourPlayerRows.map(mapTourPlayer),
    betMarkets: visibleMarketRows.map(mapBetMarket),
    betOptions: optionRows.map(mapBetOption),
    bets: betRows.map(mapBet),
  };
}

export async function getTourInfoBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], handbookSections: [], itineraryItems: [], teamDayKit: [], tourTeams: [] };

  const [roundRows, sectionRows, itineraryRows, kitRows, teamRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'tour info rounds'),
    runQuery(table(supabase, 'tour_handbook_sections').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour handbook sections'),
    runQuery(table(supabase, 'tour_itinerary_items').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour itinerary items'),
    runQuery(table(supabase, 'tour_team_day_kit').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour team day kit'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour info teams'),
  ]);

  return {
    tour,
    rounds: roundRows.map(mapRound),
    handbookSections: sectionRows.map(mapTourHandbookSection),
    itineraryItems: itineraryRows.map(mapTourItineraryItem),
    teamDayKit: kitRows.map(mapTourTeamDayKit),
    tourTeams: teamRows.map(mapTourTeam),
  };
}

export async function getSummaryBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], recentResults: [], openMarkets: [] };

  const [roundRows, resultRows, marketRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'summary rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).eq('status', 'complete').order('match_number', { ascending: true }), 'recent results'),
    runQuery(table(supabase, 'bet_markets').select('*').eq('tour_id', tour.id).eq('status', 'open').order('created_at', { ascending: true }), 'open markets'),
  ]);

  return {
    tour,
    rounds: roundRows.map(mapRound),
    recentResults: resultRows.map(mapMatch),
    openMarkets: marketRows.map(mapBetMarket),
  };
}
