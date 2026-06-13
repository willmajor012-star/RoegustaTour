import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './_supabase';
import { mapBet, mapBetMarket, mapBetOption, mapHistoricalPlayerStats, mapMatch, mapMatchParticipant, mapPlayer, mapPlayerMatchResult, mapRound, mapTour, mapTourHandbookSection, mapTourItineraryItem, mapTourPlayer, mapTourTeam, mapTourTeamDayKit, mapTourTeamMember, mapTourTeamResult } from './_mappers';
import type { Match, Round, Tour, TourTeam, TourTeamMember } from '../../src/lib/types';

type Row = Record<string, unknown>;
type SupabaseResult<T> = { data: T[] | null; error: { message: string } | null };
type QueryBuilder<T = Row> = PromiseLike<SupabaseResult<T>> & {
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

function table<T = Row>(supabase: SupabaseClient, name: string): QueryBuilder<T> {
  return supabase.from(name) as unknown as QueryBuilder<T>;
}

export async function withLiveData<T extends object>(read: (supabase: SupabaseClient) => Promise<T>): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  try {
    const supabase = createServerSupabaseClient();
    const data = await read(supabase);
    return { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ...data, source: 'supabase' }) };
  } catch (error) {
    console.error('Public live data request failed:', error);
    return { statusCode: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Live data unavailable' }) };
  }
}

export function isPublicTour(tour?: Pick<Tour, 'status' | 'isCurrentPublic'>): boolean {
  if (!tour) return false;
  return tour.isCurrentPublic === true || tour.status === 'complete' || tour.status === 'archived';
}

export function isPublicRound(round: Pick<Round, 'status' | 'published'>, tour?: Pick<Tour, 'status' | 'isCurrentPublic'>): boolean {
  if (tour?.isCurrentPublic === true) return round.published === true;
  return isPublicTour(tour) && (round.published === true || round.status === 'complete');
}

export function isPublicMatch(match: Pick<Match, 'published' | 'status'>, round?: Pick<Round, 'status' | 'published'>, tour?: Pick<Tour, 'status' | 'isCurrentPublic'>): boolean {
  if (match.published !== true && match.status !== 'complete') return false;
  return round ? isPublicRound(round, tour) : true;
}

export function isPublicTeamRoster(tour: Pick<Tour, 'status' | 'isCurrentPublic'> | undefined, team: Pick<TourTeam, 'published'>): boolean {
  if (!tour) return false;
  return team.published === true && isPublicTour(tour);
}

export function filterPublicRounds<TRound extends Round>(rounds: TRound[], tour?: Tour): TRound[] {
  return rounds.filter((round) => isPublicRound(round, tour));
}

export function filterPublicTeams<TTeam extends TourTeam>(teams: TTeam[], tour?: Tour): TTeam[] {
  return teams.filter((team) => isPublicTeamRoster(tour, team));
}

export function filterPublicTeamMembers<TMember extends TourTeamMember>(members: TMember[], publicTeams: Pick<TourTeam, 'id'>[]): TMember[] {
  const publicTeamIds = new Set(publicTeams.map((team) => team.id));
  return members.filter((member) => publicTeamIds.has(member.teamId));
}

function rowsById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getCurrentTour(supabase: SupabaseClient) {
  const tours = (await runQuery(table(supabase, 'tours').select('*').eq('is_current_public', true).order('year', { ascending: false }).limit(1), 'current public tour')).map(mapTour);
  return tours[0];
}

export async function getPublicMatchBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [], tourTeamMembers: [] };

  const [roundRows, matchRows, playerRows, teamRows, memberRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).eq('published', true).order('round_number', { ascending: true }), 'public rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).or('published.eq.true,status.eq.complete').order('match_number', { ascending: true }), 'public matches'),
    runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'public players'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).eq('published', true).order('sort_order', { ascending: true }), 'public tour teams'),
    runQuery(table(supabase, 'tour_team_members').select('*').eq('tour_id', tour.id), 'public tour team members'),
  ]);

  const rounds = roundRows.map(mapRound);
  const roundById = rowsById(rounds);
  const matches = matchRows.map(mapMatch).filter((match) => isPublicMatch(match, roundById.get(match.roundId), tour));
  const matchIds = matches.map((match) => match.id);
  const participantRows = matchIds.length > 0 ? await runQuery(table(supabase, 'match_participants').select('*').in('match_id', matchIds), 'public match participants') : [];
  const tourTeams = filterPublicTeams(teamRows.map(mapTourTeam), tour);

  return {
    tour,
    rounds,
    matches,
    matchParticipants: participantRows.map(mapMatchParticipant),
    players: playerRows.map(mapPlayer),
    tourTeams,
    tourTeamMembers: filterPublicTeamMembers(memberRows.map(mapTourTeamMember), tourTeams),
  };
}

export async function getScoreBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, tourId: '', teams: [], rounds: [], matches: [] };

  const [teamRows, roundRows, matchRows] = await Promise.all([
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).eq('published', true).order('sort_order', { ascending: true }), 'tour teams'),
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).eq('published', true).order('round_number', { ascending: true }), 'rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).or('published.eq.true,status.eq.complete').order('match_number', { ascending: true }), 'public score matches'),
  ]);
  const rounds = roundRows.map(mapRound);
  const roundById = rowsById(rounds);

  return {
    tour,
    tourId: tour.id,
    teams: filterPublicTeams(teamRows.map(mapTourTeam), tour),
    rounds,
    matches: matchRows.map(mapMatch).filter((match) => isPublicMatch(match, roundById.get(match.roundId), tour)),
  };
}

export async function getPlayersBundle(supabase: SupabaseClient) {
  return { players: (await runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'players')).map(mapPlayer) };
}

export async function getStatsBundle(supabase: SupabaseClient) {
  const [playerRows, matchRows, participantRows, historicalRows] = await Promise.all([
    runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'players'),
    runQuery(table(supabase, 'matches').select('*').eq('status', 'complete'), 'complete matches'),
    runQuery(table(supabase, 'match_participants').select('*, matches!inner(status)').eq('matches.status', 'complete'), 'match participants'),
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
    currentTour ? runQuery(table(supabase, 'matches').select('*').eq('tour_id', currentTour.id).or('published.eq.true,status.eq.complete').order('match_number', { ascending: true }), 'current public matches') : Promise.resolve([]),
  ]);

  const tours = tourRows.map(mapTour).filter(isPublicTour);
  const tourById = rowsById(tours);
  const rounds = roundRows.map(mapRound).filter((round) => isPublicRound(round, tourById.get(round.tourId)));
  const roundById = rowsById(rounds);
  const matchById = new Map([...completedMatchRows, ...currentPublicMatchRows]
    .map(mapMatch)
    .filter((match) => isPublicMatch(match, roundById.get(match.roundId), tourById.get(match.tourId)))
    .map((match) => [match.id, match]));
  const matchIds = [...matchById.keys()];
  const [participantRows, playerResultRows] = matchIds.length > 0
    ? await Promise.all([
      runQuery(table(supabase, 'match_participants').select('*').in('match_id', matchIds), 'match participants'),
      runQuery(table(supabase, 'player_match_results').select('*').in('match_id', matchIds), 'player match results'),
    ])
    : [[], []];
  const tourTeams = teamRows.map(mapTourTeam).filter((team) => isPublicTeamRoster(tourById.get(team.tourId), team));

  return {
    currentTour,
    players: playerRows.map(mapPlayer),
    tours,
    tourTeams,
    tourPlayers: tourPlayerRows.map(mapTourPlayer).filter((tourPlayer) => tourById.has(tourPlayer.tourId)),
    tourTeamMembers: filterPublicTeamMembers(memberRows.map(mapTourTeamMember), tourTeams),
    tourTeamResults: resultRows.map(mapTourTeamResult).filter((result) => tourById.has(result.tourId)),
    rounds,
    matches: [...matchById.values()],
    matchParticipants: participantRows.map(mapMatchParticipant),
    playerMatchResults: playerResultRows.map(mapPlayerMatchResult),
  };
}

export async function getBettingBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { rounds: [], players: [], tourPlayers: [], betMarkets: [], betOptions: [], bets: [] };

  const [roundRows, playerRows, tourPlayerRows, marketRows, teamRows, memberRows, matchRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).eq('published', true).order('round_number', { ascending: true }), 'bet rounds'),
    runQuery(table(supabase, 'players').select('*').eq('active', true).order('display_name', { ascending: true }), 'bet players'),
    runQuery(table(supabase, 'tour_players').select('*').eq('tour_id', tour.id), 'bet tour players'),
    runQuery(table(supabase, 'bet_markets').select('*').eq('tour_id', tour.id).order('created_at', { ascending: true }), 'bet markets'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).eq('published', true), 'bet tour teams'),
    runQuery(table(supabase, 'tour_team_members').select('*').eq('tour_id', tour.id), 'bet tour team members'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).or('published.eq.true,status.eq.complete'), 'bet public matches'),
  ]);
  const rounds = roundRows.map(mapRound);
  const publicRoundIds = new Set(rounds.map((round) => round.id));
  const publicTeams = filterPublicTeams(teamRows.map(mapTourTeam), tour);
  const publicTeamIds = new Set(publicTeams.map((team) => team.id));
  const publicPlayerIds = new Set(filterPublicTeamMembers(memberRows.map(mapTourTeamMember), publicTeams).map((member) => member.playerId));
  const publicMatchIds = new Set(matchRows.map(mapMatch).filter((match) => publicRoundIds.has(match.roundId) && isPublicMatch(match)).map((match) => match.id));
  const visibleMarketRows = marketRows.filter((market) => {
    if (String(market.status) === 'void') return false;
    const roundId = typeof market.round_id === 'string' ? market.round_id : '';
    const matchId = typeof market.match_id === 'string' ? market.match_id : '';
    if (roundId && !publicRoundIds.has(roundId)) return false;
    if (matchId && !publicMatchIds.has(matchId)) return false;
    return true;
  });
  const marketIds = visibleMarketRows.map((market) => String(market.id));

  const [optionRows, betRows] = await Promise.all([
    marketIds.length > 0 ? runQuery(table(supabase, 'bet_options').select('*').in('market_id', marketIds).order('sort_order', { ascending: true }), 'bet options') : Promise.resolve([]),
    marketIds.length > 0 ? runQuery(table(supabase, 'bets').select('*').in('market_id', marketIds).order('created_at', { ascending: true }), 'bets') : Promise.resolve([]),
  ]);
  const visibleOptions = optionRows.filter((option) => {
    const teamId = typeof option.linked_team_id === 'string' ? option.linked_team_id : '';
    const playerId = typeof option.linked_player_id === 'string' ? option.linked_player_id : '';
    if (teamId && !publicTeamIds.has(teamId)) return false;
    if (playerId && !publicPlayerIds.has(playerId)) return false;
    return true;
  });
  const visibleOptionIds = new Set(visibleOptions.map((option) => String(option.id)));
  const visibleMarketIds = new Set(visibleOptions.map((option) => String(option.market_id)));
  const visibleMarketsWithOptions = visibleMarketRows.filter((market) => visibleMarketIds.has(String(market.id)));

  return {
    rounds,
    players: playerRows.map(mapPlayer),
    tourPlayers: tourPlayerRows.map(mapTourPlayer).filter((tourPlayer) => publicPlayerIds.has(tourPlayer.playerId)),
    betMarkets: visibleMarketsWithOptions.map(mapBetMarket),
    betOptions: visibleOptions.map(mapBetOption),
    bets: betRows.filter((bet) => visibleOptionIds.has(String(bet.option_id))).map(mapBet),
  };
}

export async function getTourInfoBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], handbookSections: [], itineraryItems: [], teamDayKit: [], tourTeams: [] };

  const [roundRows, sectionRows, itineraryRows, kitRows, teamRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).eq('published', true).order('round_number', { ascending: true }), 'tour info rounds'),
    runQuery(table(supabase, 'tour_handbook_sections').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour handbook sections'),
    runQuery(table(supabase, 'tour_itinerary_items').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour itinerary items'),
    runQuery(table(supabase, 'tour_team_day_kit').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour team day kit'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).eq('published', true).order('sort_order', { ascending: true }), 'tour info teams'),
  ]);
  const tourTeams = filterPublicTeams(teamRows.map(mapTourTeam), tour);
  const publicTeamIds = new Set(tourTeams.map((team) => team.id));

  return {
    tour,
    rounds: roundRows.map(mapRound),
    handbookSections: sectionRows.map(mapTourHandbookSection),
    itineraryItems: itineraryRows.map(mapTourItineraryItem),
    teamDayKit: kitRows.map(mapTourTeamDayKit).filter((kit) => publicTeamIds.has(kit.teamId)),
    tourTeams,
  };
}

export async function getSummaryBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], recentResults: [], openMarkets: [] };

  const [roundRows, resultRows, marketRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).eq('published', true).order('round_number', { ascending: true }), 'summary rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).eq('status', 'complete').order('match_number', { ascending: true }), 'recent results'),
    runQuery(table(supabase, 'bet_markets').select('*').eq('tour_id', tour.id).eq('status', 'open').order('created_at', { ascending: true }), 'open markets'),
  ]);
  const rounds = roundRows.map(mapRound);
  const roundById = rowsById(rounds);
  const recentResults = resultRows.map(mapMatch).filter((match) => isPublicMatch(match, roundById.get(match.roundId), tour));
  const publicRoundIds = new Set(rounds.map((round) => round.id));

  return {
    tour,
    rounds,
    recentResults,
    openMarkets: marketRows.filter((market) => !market.round_id || publicRoundIds.has(String(market.round_id))).map(mapBetMarket),
  };
}
