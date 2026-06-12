import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapMatch, mapMatchParticipant } from './_mappers';
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
  const status = optionalString(body.status) as Match['status'] | null;
  const pointsAvailable = optionalNumber(body.pointsAvailable);
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
  if (!status || !allowedStatuses.includes(status)) return badRequest('Match status is invalid.');
  if (pointsAvailable === null || pointsAvailable <= 0) return badRequest('Points available must be greater than zero.');
  if (!sideAPlayerIds || !sideBPlayerIds) return badRequest('Player IDs must be arrays.');
  if ((pointsSideA !== null && pointsSideA < 0) || (pointsSideB !== null && pointsSideB < 0)) return badRequest('Result points must be zero or greater.');
  if (status === 'complete') {
    if (pointsSideA === null || pointsSideB === null) return badRequest('Complete matches require Side A and Side B points.');
    if (Math.abs(pointsSideA + pointsSideB - pointsAvailable) > 0.001) return badRequest('Complete match points must add up to the points available.');
  }

  const allPlayerIds = [...sideAPlayerIds, ...sideBPlayerIds];
  if (status === 'complete' && allPlayerIds.length === 0) return badRequest('Complete matches require at least one participant.');
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

  const winningSide = status === 'void' ? 'void' : pointsSideA !== null && pointsSideB !== null ? (pointsSideA > pointsSideB ? 'A' : pointsSideB > pointsSideA ? 'B' : 'halved') : null;

  const matchRow = {
    id: id ?? crypto.randomUUID(),
    tour_id: tourId,
    round_id: roundId,
    match_number: matchNumber,
    format,
    status,
    side_a_team_id: sideATeamId,
    side_b_team_id: sideBTeamId,
    side_a_label: optionalString(body.sideALabel),
    side_b_label: optionalString(body.sideBLabel),
    points_available: pointsAvailable,
    points_side_a: status === 'complete' ? pointsSideA : null,
    points_side_b: status === 'complete' ? pointsSideB : null,
    winning_side: status === 'complete' || status === 'void' ? winningSide : null,
    result_text: optionalString(body.resultText),
    tee_time: optionalString(body.teeTime),
    published: typeof body.published === 'boolean' ? body.published : false,
    notes: optionalString(body.notes),
  };

  const query = id
    ? supabase.from('matches').update(matchRow).eq('id', id).select('*').single()
    : supabase.from('matches').insert(matchRow).select('*').single();
  let saved: Record<string, unknown>;
  try {
    saved = await runSingle<Record<string, unknown>>(query, 'save match');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('matches_round_id_match_number_key') || message.toLowerCase().includes('duplicate key')) return badRequest(duplicateMatchNumberMessage);
    throw error;
  }
  const matchId = String(saved.id);

  const removed = await supabase.from('match_participants').delete().eq('match_id', matchId);
  if (removed.error) throw new Error(`replace match participants: ${removed.error.message}`);

  const participantRows = [
    ...sideAPlayerIds.map((playerId) => ({ id: crypto.randomUUID(), match_id: matchId, player_id: playerId, side: 'A', team_id: sideATeamId })),
    ...sideBPlayerIds.map((playerId) => ({ id: crypto.randomUUID(), match_id: matchId, player_id: playerId, side: 'B', team_id: sideBTeamId })),
  ];
  if (participantRows.length > 0) {
    const inserted = await supabase.from('match_participants').insert(participantRows);
    if (inserted.error) throw new Error(`insert match participants: ${inserted.error.message}`);
  }

  const staleResultsRemoved = await supabase.from('player_match_results').delete().eq('match_id', matchId);
  if (staleResultsRemoved.error) throw new Error(`remove stale player match results: ${staleResultsRemoved.error.message}`);

  if (status === 'complete') {
    const resultRows = participantRows.map((participant) => {
      const side = participant.side as 'A' | 'B';
      const result = winningSide === 'halved' ? 'draw' : winningSide === side ? 'win' : 'loss';
      return {
        id: crypto.randomUUID(),
        tour_id: tourId,
        round_id: roundId,
        match_id: matchId,
        player_id: participant.player_id,
        team_id: participant.team_id,
        format,
        result,
        points_for: side === 'A' ? pointsSideA : pointsSideB,
        points_against: side === 'A' ? pointsSideB : pointsSideA,
      };
    });
    if (resultRows.length > 0) {
      const insertedResults = await supabase.from('player_match_results').insert(resultRows);
      if (insertedResults.error) throw new Error(`insert player match results: ${insertedResults.error.message}`);
    }
  }

  const participants = await runRows(supabase.from('match_participants').select('*').eq('match_id', matchId), 'match participants after save');
  const refreshedMatch = await runSingle<Record<string, unknown>>(supabase.from('matches').select('*').eq('id', matchId).single(), 'match after save');
  return jsonResponse(200, { ok: true, match: mapMatch(refreshedMatch), matchParticipants: participants.map(mapMatchParticipant) });
});
