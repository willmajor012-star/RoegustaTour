import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { mapRoundPrizeResult } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type RoundRow = { id: string; tour_id: string; format?: string | null; format_label?: string | null };
function defaultForRound(round: RoundRow) {
  const format = round.format ?? '';
  const label = (round.format_label ?? '').toLowerCase();
  if (format === 'scramble' || label.includes('scramble')) return { prize_type: 'team_gross', title: 'Team lowest gross' };
  if (format === 'better_ball' || format === 'singles' || label.includes('better') || label.includes('4bbb') || label.includes('singles')) return { prize_type: 'individual_stableford', title: 'Individual Stableford' };
  return undefined;
}
export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  const template2026 = body.template2026 === true;
  if (!tourId) return badRequest('Tour ID is required.');
  const rounds = await runRows<RoundRow>(supabase.from('rounds').select('id, tour_id, format, format_label').eq('tour_id', tourId), 'default prize rounds');
  const existing = await runRows<{ round_id: string; prize_type: string; title: string }>(supabase.from('round_prize_results').select('round_id, prize_type, title').eq('tour_id', tourId), 'existing prize results');
  const rows = rounds.map((round, index) => ({ round, draft: template2026 ? ([
    { prize_type: 'individual_stableford', title: 'Individual Stableford', score_unit: 'points' },
    { prize_type: 'team_gross', title: 'Team lowest gross', score_unit: 'gross' },
    { prize_type: 'individual_stableford', title: 'Individual Stableford', score_unit: 'points' },
    { prize_type: 'individual_stableford', title: 'Individual Stableford', score_unit: 'points' },
  ][index]) : defaultForRound(round) })).filter((item): item is { round: RoundRow; draft: { prize_type: string; title: string } } => Boolean(item.draft)).filter(({ round, draft }) => !existing.some((row) => row.round_id === round.id && row.prize_type === draft.prize_type && row.title.toLowerCase() === draft.title.toLowerCase())).map(({ round, draft }) => ({ id: crypto.randomUUID(), tour_id: tourId, round_id: round.id, prize_type: draft.prize_type, title: draft.title, score_unit: 'score_unit' in draft ? draft.score_unit : null, published: false }));
  if (rows.length > 0) {
    const inserted = await supabase.from('round_prize_results').insert(rows);
    if (inserted.error) throw new Error(`create default prize results: ${inserted.error.message}`);
  }
  const allRows = await runRows<Record<string, unknown>>(supabase.from('round_prize_results').select('*').eq('tour_id', tourId), 'round prize results');
  return jsonResponse(200, { ok: true, roundPrizeResults: allRows.map(mapRoundPrizeResult), createdCount: rows.length });
});
