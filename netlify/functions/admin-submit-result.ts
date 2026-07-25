import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapMatch, mapPlayerMatchResult, mapTourTeamResult } from './_mappers';
import { validateMatchplayResultText, validateResultPoints } from './_resultHelpers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type MatchRow = {
  id: string;
  tour_id: string;
  round_id: string;
  status: string;
  points_available: number | string;
};
type RoundRow = { id: string; holes?: number | string | null };
type AtomicResultSave = {
  match: Record<string, unknown>;
  playerMatchResults: Record<string, unknown>[];
  tourTeamResults: Record<string, unknown>[];
};

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const matchId = optionalString(body.matchId);
  const pointsSideA = optionalNumber(body.pointsSideA);
  const pointsSideB = optionalNumber(body.pointsSideB);
  const resultText = optionalString(body.resultText);
  const correctionReason = optionalString(body.correctionReason);
  const published = typeof body.published === 'boolean' ? body.published : null;
  const clearResult = body.clearResult === true;

  if (!tourId) return badRequest('Tour ID is required.');
  if (!matchId) return badRequest('Match ID is required.');
  if (!clearResult && (pointsSideA === null || pointsSideB === null)) return badRequest('Both result point values are required.');
  if (!clearResult && !resultText) return badRequest('Result text is required.');

  const match = await runSingle<MatchRow>(supabase.from('matches').select('id, tour_id, round_id, status, points_available').eq('id', matchId).single(), 'find result match');
  if (match.tour_id !== tourId) return badRequest('Match does not belong to this tour.');
  const round = await runSingle<RoundRow>(supabase.from('rounds').select('id, holes').eq('id', match.round_id).single(), 'find result round');
  if (!clearResult && resultText) {
    const resultTextError = validateMatchplayResultText(resultText, asNumber(round.holes ?? 18));
    if (resultTextError) return badRequest(resultTextError);
  }
  if (!clearResult) {
    const pointError = validateResultPoints(pointsSideA!, pointsSideB!, asNumber(match.points_available));
    if (pointError) return badRequest(pointError);
  }

  const saved = await runSingle<AtomicResultSave>(supabase.rpc('admin_submit_match_result_atomic', {
    p_tour_id: tourId,
    p_match_id: matchId,
    p_points_side_a: clearResult ? null : pointsSideA,
    p_points_side_b: clearResult ? null : pointsSideB,
    p_result_text: clearResult ? null : resultText,
    p_published: published,
    p_clear_result: clearResult,
    p_actor_label: session.actorLabel,
    p_correction_reason: correctionReason,
  }), 'save match result atomically');

  return jsonResponse(200, {
    ok: true,
    match: mapMatch(saved.match),
    playerMatchResults: saved.playerMatchResults.map(mapPlayerMatchResult),
    tourTeamResults: saved.tourTeamResults.map(mapTourTeamResult),
  });
});
