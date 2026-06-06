import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './_supabase';
import { mapBet, mapBetMarket, mapBetOption, mapHistoricalPlayerStats, mapMatch, mapMatchParticipant, mapPlayer, mapRound, mapTour, mapTourTeam } from './_mappers';

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

export function withMockFallback<T extends object>(read: (supabase: SupabaseClient) => Promise<T>, fallback: T): Promise<T & { source: 'supabase' | 'mock-fallback' }> {
  return (async () => {
    try {
      const supabase = createServerSupabaseClient();
      const data = await read(supabase);
      return { ...data, source: 'supabase' };
    } catch (error) {
      console.warn('Falling back to mock data because Supabase is unavailable:', error);
      return { ...fallback, source: 'mock-fallback' };
    }
  })();
}

export async function getCurrentTour(supabase: SupabaseClient) {
  const tours = (await runQuery(table(supabase, 'tours').select('*').order('year', { ascending: false }).limit(1), 'tours')).map(mapTour);
  return tours[0];
}

export async function getPublicMatchBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { rounds: [], matches: [], matchParticipants: [] };

  const publicMatches = (await runQuery(
    table(supabase, 'matches')
      .select('*')
      .eq('tour_id', tour.id)
      .or('published.eq.true,status.eq.complete')
      .order('match_number', { ascending: true }),
    'public matches',
  )).map(mapMatch);

  const publicMatchIds = publicMatches.map((match) => match.id);
  const publicRoundIds = [...new Set(publicMatches.map((match) => match.roundId))];

  const [roundRows, participantRows] = await Promise.all([
    publicRoundIds.length > 0 ? runQuery(table(supabase, 'rounds').select('*').in('id', publicRoundIds).order('round_number', { ascending: true }), 'public rounds') : Promise.resolve([]),
    publicMatchIds.length > 0 ? runQuery(table(supabase, 'match_participants').select('*').in('match_id', publicMatchIds), 'public match participants') : Promise.resolve([]),
  ]);

  return {
    rounds: roundRows.map(mapRound),
    matches: publicMatches,
    matchParticipants: participantRows.map(mapMatchParticipant),
  };
}

export async function getScoreBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tourId: '', teams: [], rounds: [], matches: [] };

  const [teamRows, roundRows, matchRows] = await Promise.all([
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour teams'),
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).eq('status', 'complete').order('match_number', { ascending: true }), 'complete matches'),
  ]);

  return {
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
    runQuery(table(supabase, 'match_participants').select('*'), 'match participants'),
    runQuery(table(supabase, 'historical_player_stats').select('*'), 'historical player stats'),
  ]);

  return {
    players: playerRows.map(mapPlayer),
    matches: matchRows.map(mapMatch),
    matchParticipants: participantRows.map(mapMatchParticipant),
    historicalPlayerStats: historicalRows.map(mapHistoricalPlayerStats),
  };
}

export async function getBettingBundle(supabase: SupabaseClient) {
  const [marketRows, optionRows, betRows] = await Promise.all([
    runQuery(table(supabase, 'bet_markets').select('*').order('created_at', { ascending: true }), 'bet markets'),
    runQuery(table(supabase, 'bet_options').select('*').order('sort_order', { ascending: true }), 'bet options'),
    runQuery(table(supabase, 'bets').select('*').order('created_at', { ascending: true }), 'bets'),
  ]);

  return {
    betMarkets: marketRows.map(mapBetMarket),
    betOptions: optionRows.map(mapBetOption),
    bets: betRows.map(mapBet),
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
