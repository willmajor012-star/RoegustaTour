import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapMatch, mapPlayerMatchResult, mapTourTeamResult } from './_mappers';
import { writeAuditLog } from './_audit';
import { deriveWinningSide, playerResultForSide, validateResultPoints } from './_resultHelpers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type MatchRow = {
  id: string; tour_id: string; round_id: string; format: string; status: string; side_a_team_id: string; side_b_team_id: string;
  points_available: number | string; points_side_a?: number | string | null; points_side_b?: number | string | null; winning_side?: string | null;
  result_text?: string | null; published?: boolean | null;
};
type ParticipantRow = { player_id: string; team_id: string; side: 'A' | 'B' };
type TeamRow = { id: string };
type CompletedMatchRow = { side_a_team_id: string; side_b_team_id: string; points_side_a: number | string | null; points_side_b: number | string | null; status: string };

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

async function recalculateTeamResults(supabase: Parameters<Parameters<typeof withAdminSupabase>[2]>[0], tourId: string) {
  const [teams, completedMatches] = await Promise.all([
    runRows<TeamRow>(supabase.from('tour_teams').select('id').eq('tour_id', tourId), 'result teams'),
    runRows<CompletedMatchRow>(supabase.from('matches').select('side_a_team_id, side_b_team_id, points_side_a, points_side_b, status').eq('tour_id', tourId).eq('status', 'complete'), 'completed matches for team totals'),
  ]);
  const totals = new Map(teams.map((team) => [team.id, 0]));
  for (const match of completedMatches) {
    totals.set(match.side_a_team_id, (totals.get(match.side_a_team_id) ?? 0) + asNumber(match.points_side_a ?? 0));
    totals.set(match.side_b_team_id, (totals.get(match.side_b_team_id) ?? 0) + asNumber(match.points_side_b ?? 0));
  }
  const ranked = teams.map((team) => ({ teamId: team.id, points: totals.get(team.id) ?? 0 })).sort((a, b) => b.points - a.points || a.teamId.localeCompare(b.teamId));
  const topPoints = ranked[0]?.points ?? 0;
  const winnerCount = ranked.filter((row) => row.points === topPoints && topPoints > 0).length;

  for (let index = 0; index < ranked.length; index += 1) {
    const row = ranked[index];
    const resultStatus = row.points <= 0 ? 'tbd' : winnerCount > 1 && row.points === topPoints ? 'draw' : index === 0 ? 'winner' : index === 1 ? 'runner_up' : 'tbd';
    const existing = await runRows<{ id: string }>(supabase.from('tour_team_results').select('id').eq('tour_id', tourId).eq('team_id', row.teamId).limit(1), 'find team result');
    const values = { tour_id: tourId, team_id: row.teamId, final_points: row.points, position: index + 1, result_status: resultStatus, notes: 'Auto-calculated from completed match results.' };
    const query = existing[0]?.id
      ? supabase.from('tour_team_results').update(values).eq('id', existing[0].id).select('*').single()
      : supabase.from('tour_team_results').insert({ id: crypto.randomUUID(), ...values }).select('*').single();
    await runSingle(query, 'upsert team result');
  }

  return runRows<Record<string, unknown>>(supabase.from('tour_team_results').select('*').eq('tour_id', tourId), 'team results after recalculation');
}

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const matchId = optionalString(body.matchId);
  const pointsSideA = optionalNumber(body.pointsSideA);
  const pointsSideB = optionalNumber(body.pointsSideB);
  const resultText = optionalString(body.resultText);
  const correctionReason = optionalString(body.correctionReason);
  const published = typeof body.published === 'boolean' ? body.published : undefined;

  if (!tourId) return badRequest('Tour ID is required.');
  if (!matchId) return badRequest('Match ID is required.');
  if (pointsSideA === null || pointsSideB === null) return badRequest('Both result point values are required.');
  if (!resultText) return badRequest('Result text is required.');

  const match = await runSingle<MatchRow>(supabase.from('matches').select('*').eq('id', matchId).single(), 'find result match');
  if (match.tour_id !== tourId) return badRequest('Match does not belong to this tour.');
  const pointsAvailable = asNumber(match.points_available);
  const pointError = validateResultPoints(pointsSideA, pointsSideB, pointsAvailable);
  if (pointError) return badRequest(pointError);

  const participants = await runRows<ParticipantRow>(supabase.from('match_participants').select('player_id, team_id, side').eq('match_id', matchId), 'result match participants');
  if (participants.length === 0) return badRequest('Match must have participants before a result can be submitted.');

  const previous = {
    status: match.status,
    pointsSideA: match.points_side_a,
    pointsSideB: match.points_side_b,
    winningSide: match.winning_side,
    resultText: match.result_text,
    published: match.published,
  };
  const winningSide = deriveWinningSide(pointsSideA, pointsSideB);
  const updatedMatch = await runSingle<Record<string, unknown>>(supabase.from('matches').update({
    points_side_a: pointsSideA,
    points_side_b: pointsSideB,
    winning_side: winningSide,
    result_text: resultText,
    status: 'complete',
    ...(published === undefined ? {} : { published }),
  }).eq('id', matchId).select('*').single(), 'submit result match update');

  const removed = await supabase.from('player_match_results').delete().eq('match_id', matchId);
  if (removed.error) throw new Error(`remove old player match results: ${removed.error.message}`);

  const resultRows = participants.map((participant) => ({
    id: crypto.randomUUID(),
    tour_id: tourId,
    round_id: match.round_id,
    match_id: matchId,
    player_id: participant.player_id,
    team_id: participant.team_id,
    format: match.format,
    result: playerResultForSide(participant.side, winningSide),
    points_for: participant.side === 'A' ? pointsSideA : pointsSideB,
    points_against: participant.side === 'A' ? pointsSideB : pointsSideA,
  }));
  const inserted = await supabase.from('player_match_results').insert(resultRows);
  if (inserted.error) throw new Error(`insert player match results: ${inserted.error.message}`);

  const teamResultRows = await recalculateTeamResults(supabase, tourId);
  await writeAuditLog(supabase, session, match.status === 'complete' ? 'result.corrected' : 'result.submitted', 'match', matchId, {
    tourId,
    matchId,
    previous,
    next: { pointsSideA, pointsSideB, winningSide, resultText, published: published ?? match.published },
    correctionReason,
  });

  const playerResultRows = await runRows<Record<string, unknown>>(supabase.from('player_match_results').select('*').eq('match_id', matchId), 'player results after submit');
  return jsonResponse(200, {
    ok: true,
    match: mapMatch(updatedMatch),
    playerMatchResults: playerResultRows.map(mapPlayerMatchResult),
    tourTeamResults: teamResultRows.map(mapTourTeamResult),
  });
});
