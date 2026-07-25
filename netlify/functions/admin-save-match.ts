import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapMatch, mapMatchParticipant } from './_mappers';
import { syncRequiredMarketDeadlinesForRound } from './_betMarketDeadline';
import type { Match, MatchFormat } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const allowedFormats: MatchFormat[] = ['singles', 'better_ball', 'foursomes', 'scramble', 'custom'];
const allowedStatuses: Match['status'][] = ['draft', 'planned', 'active', 'complete', 'void'];
const duplicateMatchNumberMessage = 'A match with this number already exists for this round. Edit the existing match or use the next available match number.';
const maxPlayersForFormat = (format: MatchFormat) => format === 'singles' ? 1 : format === 'custom' ? Number.POSITIVE_INFINITY : 2;

type IdRow = { id: string };
type PlayerRow = { id: string; active?: boolean };
type TourPlayerRow = { player_id: string; attending?: boolean };
type MemberRow = { player_id: string; team_id: string };
type AtomicMatchSave = {
  match: Record<string, unknown>;
  matchParticipants: Record<string, unknown>[];
};

function playerIdsFrom(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => optionalString(entry)).filter((entry): entry is string => Boolean(entry));
}

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  const roundId = optionalString(body.roundId);
  const sideATeamId = optionalString(body.sideATeamId);
  const sideBTeamId = optionalString(body.sideBTeamId);
  const matchNumber = typeof body.matchNumber === 'number' ? body.matchNumber : Number(body.matchNumber);
  const format = optionalString(body.format) as MatchFormat | null;
  const requestedStatus = optionalString(body.status) as Match['status'] | null;
  const status = requestedStatus ?? 'planned';
  const pointsSideA = optionalNumber(body.pointsSideA);
  const pointsSideB = optionalNumber(body.pointsSideB);
  const sideAPlayerIds = playerIdsFrom(body.sideAPlayerIds);
  const sideBPlayerIds = playerIdsFrom(body.sideBPlayerIds);

  if (!tourId) return badRequest('Tour ID is required.');
  if (!roundId) return badRequest('Round ID is required.');
  if (!sideATeamId || !sideBTeamId) return badRequest('Both match teams are required.');
  if (sideATeamId === sideBTeamId) return badRequest('Match sides must use different teams.');
  if (!Number.isInteger(matchNumber) || matchNumber < 1 || matchNumber > 999) return badRequest('Match number is invalid.');
  if (!format || !allowedFormats.includes(format)) return badRequest('Match format is invalid.');
  if (requestedStatus && !allowedStatuses.includes(requestedStatus)) return badRequest('Match status is invalid.');
  if (!sideAPlayerIds || !sideBPlayerIds) return badRequest('Player IDs must be arrays.');
  if ((pointsSideA !== null && pointsSideA < 0) || (pointsSideB !== null && pointsSideB < 0)) return badRequest('Result points must be zero or greater.');

  const allPlayerIds = [...sideAPlayerIds, ...sideBPlayerIds];

  if (new Set(allPlayerIds).size !== allPlayerIds.length) return badRequest('A player can only appear once in a match.');
  const maxPlayersPerSide = maxPlayersForFormat(format);
  if (sideAPlayerIds.length > maxPlayersPerSide || sideBPlayerIds.length > maxPlayersPerSide) {
    return badRequest(format === 'singles' ? 'Singles matches allow one player per side.' : 'This match format allows up to two players per side.');
  }

  const [tours, rounds, teams] = await Promise.all([
    runRows<IdRow>(supabase.from('tours').select('id').eq('id', tourId).limit(1), 'find match tour'),
    runRows<{ id: string; tour_id: string }>(supabase.from('rounds').select('id, tour_id').eq('id', roundId).limit(1), 'find match round'),
    runRows<IdRow>(supabase.from('tour_teams').select('id').eq('tour_id', tourId).in('id', [sideATeamId, sideBTeamId]), 'find match teams'),
  ]);
  if (tours.length === 0) return badRequest('Tour must exist.');
  if (rounds.length === 0 || rounds[0].tour_id !== tourId) return badRequest('Round must belong to this tour.');
  if (teams.length !== 2) return badRequest('Both teams must belong to this tour.');

  if (id) {
    const matches = await runRows<{ id: string; tour_id: string; round_id: string }>(supabase.from('matches').select('id, tour_id, round_id').eq('id', id).limit(1), 'find match');
    if (matches.length === 0) return badRequest('Match must exist.');
    if (matches[0].tour_id !== tourId || matches[0].round_id !== roundId) return badRequest('Match does not belong to this tour and round.');
  }

  const duplicateMatches = await runRows<{ id: string }>(supabase.from('matches').select('id').eq('round_id', roundId).eq('match_number', matchNumber).limit(1), 'check duplicate match number');
  if (duplicateMatches.some((match) => match.id !== id)) return badRequest(duplicateMatchNumberMessage);

  if (allPlayerIds.length > 0) {
    const booked = await runRows<{ player_id: string; match_id: string }>(supabase.from('match_participants').select('player_id, match_id, matches!inner(round_id)').eq('matches.round_id', roundId).in('player_id', allPlayerIds), 'check round player bookings');
    const doubleBooked = booked.find((row) => row.match_id !== id);
    if (doubleBooked) return badRequest('A selected player is already assigned to another match in this round. Remove them from the other match before saving.');

    const [players, attendingPlayers, memberRows] = await Promise.all([
      runRows<PlayerRow>(supabase.from('players').select('id, active').in('id', allPlayerIds), 'find match players'),
      runRows<TourPlayerRow>(supabase.from('tour_players').select('player_id, attending').eq('tour_id', tourId).eq('attending', true).in('player_id', allPlayerIds), 'find match attending players'),
      runRows<MemberRow>(supabase.from('tour_team_members').select('player_id, team_id').eq('tour_id', tourId).in('player_id', allPlayerIds), 'find match team memberships'),
    ]);

    if (players.length !== allPlayerIds.length) return badRequest('All selected players must exist.');
    if (players.some((player) => player.active === false)) return badRequest('Inactive players cannot be selected in a match.');
    if (attendingPlayers.length !== allPlayerIds.length) return badRequest('Only attending players can be selected in a match.');

    const membershipByPlayer = new Map(memberRows.map((member) => [member.player_id, member.team_id]));
    for (const playerId of sideAPlayerIds) {
      const membership = membershipByPlayer.get(playerId);
      if (membership !== sideATeamId) return badRequest('Side A players must be assigned to the Side A team.');
    }
    for (const playerId of sideBPlayerIds) {
      const membership = membershipByPlayer.get(playerId);
      if (membership !== sideBTeamId) return badRequest('Side B players must be assigned to the Side B team.');
    }
  }

  let saved: AtomicMatchSave;
  try {
    saved = await runSingle<AtomicMatchSave>(supabase.rpc('admin_save_match_setup_atomic', {
      p_id: id,
      p_tour_id: tourId,
      p_round_id: roundId,
      p_match_number: matchNumber,
      p_format: format,
      p_status: status,
      p_side_a_team_id: sideATeamId,
      p_side_b_team_id: sideBTeamId,
      p_side_a_label: optionalString(body.sideALabel),
      p_side_b_label: optionalString(body.sideBLabel),
      p_tee_time: optionalString(body.teeTime),
      p_published: typeof body.published === 'boolean' ? body.published : false,
      p_notes: optionalString(body.notes),
      p_side_a_player_ids: sideAPlayerIds,
      p_side_b_player_ids: sideBPlayerIds,
    }), 'save match setup atomically');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('matches_round_id_match_number_key') || message.toLowerCase().includes('duplicate key')) return badRequest(duplicateMatchNumberMessage);
    if (message.includes('Completed match pairings are locked')) return badRequest('This match already has a result. Clear the result in Corrections before changing its round, format, teams or players.');
    throw error;
  }

  await syncRequiredMarketDeadlinesForRound(supabase, roundId);

  return jsonResponse(200, { ok: true, match: mapMatch(saved.match), matchParticipants: saved.matchParticipants.map(mapMatchParticipant) });
});
