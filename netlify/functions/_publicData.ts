import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './_supabase';
import { requirePublicAccess, type PublicAccessEvent } from './_publicAccess';
import { mapBetMarket, mapBetOption, mapCourseGuide, mapHistoricalPlayerStats, mapMatch, mapMatchParticipant, mapPlayer, mapPlayerMatchResult, mapRound, mapRoundPrizeResult, mapTour, mapTourItineraryItem, mapTourPlayer, mapTourTeam, mapTourTeamDayKit, mapTourTeamMember, mapTourTeamResult } from './_mappers';
import type { Match, Round, Tour, TourTeam } from '../../src/lib/types';
import { publicBetPuntoMatchIds, publicBetPuntoPlayerIds, publicBetPuntoRoundIds, publicBetPuntoTeamIds, visibleBetMarkets } from '../../src/lib/betPuntoRules';
import { activeManualItineraryItems } from '../../src/lib/tourItinerary';
import { selectDefaultTour } from './_tourResolution';
import { applyAutomaticBetDefaultsForTour } from './_betDefaults';
import { calculateTeamScoreByTour } from '../../src/lib/scoring';
import { filterPublicRounds, filterPublicTeamMembers, filterPublicTeams, isPublicMatch, isPublicRound, isPublicTeamRoster, isPublicTour } from '../../src/lib/publicVisibility';

export { isPublicMatch, isPublicRound, isPublicTeamRoster, isPublicTour };

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

export async function withLiveData<T extends object>(event: PublicAccessEvent, read: (supabase: SupabaseClient) => Promise<T>): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  try {
    const supabase = createServerSupabaseClient();
    const accessError = await requirePublicAccess(event, supabase);
    if (accessError) return { ...accessError, headers: { 'content-type': 'application/json; charset=utf-8', ...(accessError.headers ?? {}) } };
    const data = await read(supabase);
    return { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ...data, source: 'supabase' }) };
  } catch (error) {
    console.error('Public live data request failed:', error);
    return { statusCode: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Live data unavailable' }) };
  }
}

function publicTeamsOrLegacyCurrent<TTeam extends TourTeam>(teams: TTeam[], tour?: Tour): TTeam[] {
  return filterPublicTeams(teams, tour);
}

function publicRoundsOrLegacyCurrent<TRound extends Round>(rounds: TRound[], tour?: Tour): TRound[] {
  return filterPublicRounds(rounds, tour);
}

function publicMatchesOrLegacyCurrent<TMatch extends Match>(matches: TMatch[], publicRoundById: Map<string, Round>, tour?: Tour): TMatch[] {
  return matches.filter((match) => isPublicMatch(match, publicRoundById.get(match.roundId), tour));
}

function mapPublicBetRow(row: Row) {
  return {
    id: String(row.id),
    marketId: String(row.market_id),
    optionId: String(row.option_id),
    bettorName: String(row.bettor_name),
    bettorPlayerId: typeof row.bettor_player_id === 'string' ? row.bettor_player_id : undefined,
    stakeText: typeof row.stake_text === 'string' ? row.stake_text : undefined,
    stakeAmountPence: typeof row.stake_amount_pence === 'number' ? row.stake_amount_pence : Number(row.stake_amount_pence) || undefined,
    payoutAmountPence: typeof row.payout_amount_pence === 'number' ? row.payout_amount_pence : undefined,
    outcomeStatus: typeof row.outcome_status === 'string' ? row.outcome_status : 'pending',
    payoutStatus: typeof row.payout_status === 'string' ? row.payout_status : 'not_applicable',
    comment: typeof row.comment === 'string' ? row.comment : undefined,
    entrySource: typeof row.entry_source === 'string' ? row.entry_source : row.admin_entered === true ? 'admin' : 'public',
    createdAt: String(row.created_at),
    status: typeof row.status === 'string' ? row.status : 'active',
  };
}

function rowsById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getCurrentTour(supabase: SupabaseClient) {
  const tours = (await runQuery(table(supabase, 'tours').select('*').order('year', { ascending: false }).limit(50), 'public tour candidates')).map(mapTour);
  const explicitCurrent = tours.find((tour) => tour.isCurrentPublic === true);
  if (explicitCurrent) return explicitCurrent;
  // A private planned tour must not mask the most recent readable archive when
  // the explicit current-public flag is temporarily absent.
  return selectDefaultTour(tours.filter(isPublicTour));
}

export async function getPublicMatchBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], matches: [], matchParticipants: [], players: [], tourPlayers: [], tourTeams: [], tourTeamMembers: [], roundPrizeResults: [], tourCourses: [] };

  const [roundRows, matchRows, playerRows, tourPlayerRows, teamRows, memberRows, prizeRows, courseRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'public rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).order('match_number', { ascending: true }), 'public matches'),
    runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'public players'),
    runQuery(table(supabase, 'tour_players').select('*').eq('tour_id', tour.id), 'public tour players'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'public tour teams'),
    runQuery(table(supabase, 'tour_team_members').select('*').eq('tour_id', tour.id), 'public tour team members'),
    runQuery(table(supabase, 'round_prize_results').select('*').eq('tour_id', tour.id).eq('published', true), 'public round prize results').catch(() => []),
    runQuery(table(supabase, 'tour_courses').select('*').eq('tour_id', tour.id).eq('published', true).order('sort_order', { ascending: true }), 'public tour courses').catch(() => []),
  ]);

  const rounds = publicRoundsOrLegacyCurrent(roundRows.map(mapRound), tour);
  const roundById = rowsById(rounds);
  const matches = publicMatchesOrLegacyCurrent(matchRows.map(mapMatch), roundById, tour);
  const matchIds = matches.map((match) => match.id);
  const participantRows = matchIds.length > 0 ? await runQuery(table(supabase, 'match_participants').select('*').in('match_id', matchIds), 'public match participants') : [];
  const matchParticipants = participantRows.map(mapMatchParticipant);
  const tourTeams = publicTeamsOrLegacyCurrent(teamRows.map(mapTourTeam), tour);
  const tourTeamMembers = filterPublicTeamMembers(memberRows.map(mapTourTeamMember), tourTeams);
  const roundPrizeResults = prizeRows.map(mapRoundPrizeResult).filter((prize) => roundById.has(prize.roundId));
  const publicPlayerIds = new Set([
    ...matchParticipants.map((participant) => participant.playerId),
    ...tourTeamMembers.map((member) => member.playerId),
    ...roundPrizeResults.map((prize) => prize.winnerPlayerId).filter((playerId): playerId is string => Boolean(playerId)),
  ]);

  return {
    tour,
    rounds,
    matches,
    matchParticipants,
    players: playerRows.map(mapPlayer).filter((player) => publicPlayerIds.has(player.id)),
    tourPlayers: tourPlayerRows.map(mapTourPlayer).filter((tourPlayer) => publicPlayerIds.has(tourPlayer.playerId)),
    tourTeams,
    tourTeamMembers,
    roundPrizeResults,
    tourCourses: courseRows.map(mapCourseGuide),
  };
}

export async function getDashboardBundle(supabase: SupabaseClient) {
  const bundle = await getPublicMatchBundle(supabase);
  if (!bundle.tour) return { ...bundle, recentResults: [], openMarkets: [], scores: [] };

  const marketRows = await runQuery(
    table(supabase, 'bet_markets').select('*').eq('tour_id', bundle.tour.id).eq('status', 'open').order('created_at', { ascending: true }),
    'dashboard open markets',
  );
  const publicRoundIds = new Set(bundle.rounds.map((round) => round.id));

  return {
    ...bundle,
    recentResults: bundle.matches.filter((match) => match.status === 'complete'),
    openMarkets: marketRows.filter((market) => !market.round_id || publicRoundIds.has(String(market.round_id))).map(mapBetMarket),
    scores: calculateTeamScoreByTour(bundle.tour.id, bundle.tourTeams, bundle.rounds, bundle.matches),
  };
}

export async function getPublicCourseBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], tourCourses: [] };
  const [roundRows, courseRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'course guide rounds'),
    runQuery(table(supabase, 'tour_courses').select('*').eq('tour_id', tour.id).eq('published', true).order('sort_order', { ascending: true }), 'published tour courses').catch(() => []),
  ]);
  return {
    tour,
    rounds: publicRoundsOrLegacyCurrent(roundRows.map(mapRound), tour),
    tourCourses: courseRows.map(mapCourseGuide),
  };
}

export async function getScoreBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, tourId: '', teams: [], rounds: [], matches: [] };

  const [teamRows, roundRows, matchRows] = await Promise.all([
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour teams'),
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).order('match_number', { ascending: true }), 'public score matches'),
  ]);
  const rounds = publicRoundsOrLegacyCurrent(roundRows.map(mapRound), tour);
  const roundById = rowsById(rounds);

  return {
    tour,
    tourId: tour.id,
    teams: publicTeamsOrLegacyCurrent(teamRows.map(mapTourTeam), tour),
    rounds,
    matches: publicMatchesOrLegacyCurrent(matchRows.map(mapMatch), roundById, tour),
  };
}

export async function getPlayersBundle(supabase: SupabaseClient) {
  const bundle = await getPublicMatchBundle(supabase);
  return { players: bundle.players };
}

export async function getStatsBundle(supabase: SupabaseClient) {
  const [playerRows, tourRows, roundRows, matchRows, historicalRows] = await Promise.all([
    runQuery(table(supabase, 'players').select('*').order('display_name', { ascending: true }), 'players'),
    runQuery(table(supabase, 'tours').select('*'), 'stats tours'),
    runQuery(table(supabase, 'rounds').select('*'), 'stats rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('status', 'complete'), 'complete matches'),
    runQuery(table(supabase, 'historical_player_stats').select('*'), 'historical player stats'),
  ]);
  const publicTours = tourRows.map(mapTour).filter(isPublicTour);
  const tourById = rowsById(publicTours);
  const publicRounds = roundRows.map(mapRound).filter((round) => isPublicRound(round, tourById.get(round.tourId)));
  const roundById = rowsById(publicRounds);
  const publicMatches = matchRows.map(mapMatch).filter((match) => isPublicMatch(match, roundById.get(match.roundId), tourById.get(match.tourId)));
  const publicMatchIds = publicMatches.map((match) => match.id);
  const participantRows = publicMatchIds.length > 0
    ? await runQuery(table(supabase, 'match_participants').select('*').in('match_id', publicMatchIds), 'match participants')
    : [];
  const matchParticipants = participantRows.map(mapMatchParticipant);
  const historicalPlayerStats = historicalRows.map(mapHistoricalPlayerStats).filter((row) => !row.tourId || tourById.has(row.tourId));
  const publicPlayerIds = new Set([
    ...matchParticipants.map((participant) => participant.playerId),
    ...historicalPlayerStats.map((row) => row.playerId),
  ]);

  return {
    players: playerRows.map(mapPlayer).filter((player) => publicPlayerIds.has(player.id)),
    matches: publicMatches,
    matchParticipants,
    historicalPlayerStats,
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
    currentTour ? runQuery(table(supabase, 'matches').select('*').eq('tour_id', currentTour.id).order('match_number', { ascending: true }), 'current public matches') : Promise.resolve([]),
  ]);

  const tours = tourRows.map(mapTour).filter(isPublicTour);
  const tourById = rowsById(tours);
  const allRounds = roundRows.map(mapRound);
  const currentTourRounds = currentTour ? publicRoundsOrLegacyCurrent(allRounds.filter((round) => round.tourId === currentTour.id), currentTour) : [];
  const currentTourRoundIds = new Set(currentTourRounds.map((round) => round.id));
  const rounds = allRounds.filter((round) => currentTourRoundIds.has(round.id) || isPublicRound(round, tourById.get(round.tourId)));
  const roundById = rowsById(rounds);
  const matchRowsForStats = [...completedMatchRows.map(mapMatch), ...currentPublicMatchRows.map(mapMatch)];
  const currentTourMatches = currentTour ? publicMatchesOrLegacyCurrent(matchRowsForStats.filter((match) => match.tourId === currentTour.id), roundById, currentTour) : [];
  const currentTourMatchIds = new Set(currentTourMatches.map((match) => match.id));
  const matchById = new Map(matchRowsForStats
    .filter((match) => currentTourMatchIds.has(match.id) || isPublicMatch(match, roundById.get(match.roundId), tourById.get(match.tourId)))
    .map((match) => [match.id, match]));
  const matchIds = [...matchById.keys()];
  const [participantRows, playerResultRows] = matchIds.length > 0
    ? await Promise.all([
      runQuery(table(supabase, 'match_participants').select('*').in('match_id', matchIds), 'match participants'),
      runQuery(table(supabase, 'player_match_results').select('*').in('match_id', matchIds), 'player match results'),
    ])
    : [[], []];
  const allTeams = teamRows.map(mapTourTeam);
  const currentTourTeams = currentTour ? publicTeamsOrLegacyCurrent(allTeams.filter((team) => team.tourId === currentTour.id), currentTour) : [];
  const currentTourTeamIds = new Set(currentTourTeams.map((team) => team.id));
  const tourTeams = allTeams.filter((team) => currentTourTeamIds.has(team.id) || isPublicTeamRoster(tourById.get(team.tourId), team));
  const tourTeamMembers = filterPublicTeamMembers(memberRows.map(mapTourTeamMember), tourTeams);
  const matchParticipants = participantRows.map(mapMatchParticipant);
  const playerMatchResults = playerResultRows.map(mapPlayerMatchResult);
  const publicPlayerIds = new Set([
    ...tourTeamMembers.map((member) => member.playerId),
    ...matchParticipants.map((participant) => participant.playerId),
    ...playerMatchResults.map((result) => result.playerId),
  ]);

  return {
    currentTour,
    players: playerRows.map(mapPlayer).filter((player) => publicPlayerIds.has(player.id)),
    tours,
    tourTeams,
    tourPlayers: tourPlayerRows.map(mapTourPlayer).filter((tourPlayer) => tourById.has(tourPlayer.tourId) && publicPlayerIds.has(tourPlayer.playerId)),
    tourTeamMembers,
    tourTeamResults: resultRows.map(mapTourTeamResult).filter((result) => tourById.has(result.tourId)),
    rounds,
    matches: [...matchById.values()],
    matchParticipants,
    playerMatchResults,
  };
}

export async function getBettingBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], players: [], tourPlayers: [], betMarkets: [], betOptions: [], bets: [] };
  await applyAutomaticBetDefaultsForTour(supabase, tour.id);

  const [roundRows, playerRows, tourPlayerRows, marketRows, teamRows, memberRows, matchRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'bet rounds'),
    runQuery(table(supabase, 'players').select('*').eq('active', true).order('display_name', { ascending: true }), 'bet players'),
    runQuery(table(supabase, 'tour_players').select('*').eq('tour_id', tour.id), 'bet tour players'),
    runQuery(table(supabase, 'bet_markets').select('*').eq('tour_id', tour.id).order('created_at', { ascending: true }), 'bet markets'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id), 'bet tour teams'),
    runQuery(table(supabase, 'tour_team_members').select('*').eq('tour_id', tour.id), 'bet tour team members'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id), 'bet public matches'),
  ]);
  const rounds = publicRoundsOrLegacyCurrent(roundRows.map(mapRound), tour);
  const roundById = rowsById(rounds);
  const publicMatches = publicMatchesOrLegacyCurrent(matchRows.map(mapMatch), roundById, tour);
  const publicTeams = publicTeamsOrLegacyCurrent(teamRows.map(mapTourTeam), tour);
  const players = playerRows.map(mapPlayer);
  const tourPlayers = tourPlayerRows.map(mapTourPlayer);
  const teamMembers = memberRows.map(mapTourTeamMember);
  const publicRoundIds = publicBetPuntoRoundIds(rounds);
  const publicMatchIds = publicBetPuntoMatchIds(publicMatches);
  const publicPlayerIds = publicBetPuntoPlayerIds(players, tourPlayers);
  const publicTeamIds = publicBetPuntoTeamIds(publicTeams, teamMembers);
  const candidateMarketIds = marketRows.map((market) => String(market.id));

  const [optionRows, betRows] = await Promise.all([
    candidateMarketIds.length > 0 ? runQuery(table(supabase, 'bet_options').select('*').in('market_id', candidateMarketIds).order('sort_order', { ascending: true }), 'bet options') : Promise.resolve([]),
    candidateMarketIds.length > 0 ? runQuery(table(supabase, 'bets').select('*').in('market_id', candidateMarketIds).order('created_at', { ascending: true }), 'bets') : Promise.resolve([]),
  ]);
  const options = optionRows.map(mapBetOption);
  const visibilityContext = { roundIds: publicRoundIds, matchIds: publicMatchIds, playerIds: publicPlayerIds, teamIds: publicTeamIds };
  const visibleMarkets = visibleBetMarkets(marketRows.map(mapBetMarket), options, visibilityContext);
  const visibleMarketIds = new Set(visibleMarkets.map((market) => market.id));
  const visibleOptions = options.filter((option) => visibleMarketIds.has(option.marketId));
  const visibleOptionIds = new Set(visibleOptions.map((option) => option.id));

  return {
    tour,
    rounds,
    players: players.filter((player) => publicPlayerIds.has(player.id)),
    tourPlayers: tourPlayers.filter((tourPlayer) => publicPlayerIds.has(tourPlayer.playerId)),
    betMarkets: visibleMarkets,
    betOptions: visibleOptions,
    bets: betRows.filter((bet) => visibleOptionIds.has(String(bet.option_id))).map(mapPublicBetRow),
  };
}

export async function getTourInfoBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], handbookSections: [], itineraryItems: [], teamDayKit: [], tourTeams: [], players: [], roundPrizeResults: [] };

  const [roundRows, itineraryRows, kitRows, teamRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'tour info rounds'),
    runQuery(table(supabase, 'tour_itinerary_items').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour itinerary items'),
    runQuery(table(supabase, 'tour_team_day_kit').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour team day kit'),
    runQuery(table(supabase, 'tour_teams').select('*').eq('tour_id', tour.id).order('sort_order', { ascending: true }), 'tour info teams'),
  ]);
  const tourTeams = publicTeamsOrLegacyCurrent(teamRows.map(mapTourTeam), tour);
  const publicTeamIds = new Set(tourTeams.map((team) => team.id));

  const rounds = publicRoundsOrLegacyCurrent(roundRows.map(mapRound), tour);
  return {
    tour,
    rounds,
    handbookSections: [],
    itineraryItems: activeManualItineraryItems(itineraryRows.map(mapTourItineraryItem), tour.id),
    teamDayKit: kitRows.map(mapTourTeamDayKit).filter((kit) => publicTeamIds.has(kit.teamId)),
    tourTeams,
    players: [],
    roundPrizeResults: [],
  };
}

export async function getSummaryBundle(supabase: SupabaseClient) {
  const tour = await getCurrentTour(supabase);
  if (!tour) return { tour: undefined, rounds: [], recentResults: [], openMarkets: [], tourCourses: [] };

  const [roundRows, resultRows, marketRows, courseRows] = await Promise.all([
    runQuery(table(supabase, 'rounds').select('*').eq('tour_id', tour.id).order('round_number', { ascending: true }), 'summary rounds'),
    runQuery(table(supabase, 'matches').select('*').eq('tour_id', tour.id).eq('status', 'complete').order('match_number', { ascending: true }), 'recent results'),
    runQuery(table(supabase, 'bet_markets').select('*').eq('tour_id', tour.id).eq('status', 'open').order('created_at', { ascending: true }), 'open markets'),
    runQuery(table(supabase, 'tour_courses').select('*').eq('tour_id', tour.id).eq('published', true).order('sort_order', { ascending: true }), 'summary tour courses').catch(() => []),
  ]);
  const rounds = publicRoundsOrLegacyCurrent(roundRows.map(mapRound), tour);
  const roundById = rowsById(rounds);
  const recentResults = publicMatchesOrLegacyCurrent(resultRows.map(mapMatch), roundById, tour).filter((match) => match.status === 'complete');
  const publicRoundIds = new Set(rounds.map((round) => round.id));

  return {
    tour,
    rounds,
    recentResults,
    openMarkets: marketRows.filter((market) => !market.round_id || publicRoundIds.has(String(market.round_id))).map(mapBetMarket),
    tourCourses: courseRows.map(mapCourseGuide),
  };
}
