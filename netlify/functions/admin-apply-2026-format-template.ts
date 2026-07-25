import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { mapRound, mapTourItineraryItem } from './_mappers';
import { syncRequiredMarketDeadlinesForRound } from './_betMarketDeadline';
import type { MatchFormat } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type RoundRow = { id: string; round_number: number; tee_time?: string | null; status?: string | null; published?: boolean | null };

type TemplateRound = { round_number: number; name: string; round_date: string; session: 'AM' | 'PM'; course_name: string; format: MatchFormat; format_label: string; holes: 9 | 18; status: 'planned' };

const template: TemplateRound[] = [
  { round_number: 1, name: 'Saturday AM 4BBB', round_date: '2026-11-07', session: 'AM', course_name: 'Faldo Course', format: 'better_ball', format_label: '4BBB', holes: 18, status: 'planned' },
  { round_number: 2, name: "Saturday PM O'Connor Scramble", round_date: '2026-11-07', session: 'PM', course_name: "O'Connor Jnr. Course", format: 'scramble', format_label: 'Scramble', holes: 9, status: 'planned' },
  { round_number: 3, name: 'Sunday Singles', round_date: '2026-11-08', session: 'AM', course_name: 'Old Course', format: 'singles', format_label: 'Singles', holes: 18, status: 'planned' },
  { round_number: 4, name: 'Monday 9-hole 4BBB', round_date: '2026-11-09', session: 'AM', course_name: 'Course TBC', format: 'better_ball', format_label: '4BBB', holes: 9, status: 'planned' },
];

function notes(session: string) { return `[Session: ${session}]`; }

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  if (!tourId) return badRequest('Tour ID is required.');
  const tours = await runRows<{ id: string; year: number }>(supabase.from('tours').select('id, year').eq('id', tourId).limit(1), 'find tour');
  if (tours.length === 0) return badRequest('Tour must exist.');
  if (Number(tours[0].year) !== 2026) return badRequest('The 2026 format template can only be applied to a 2026 tour.');

  const [existingRounds, courseRows] = await Promise.all([
    runRows<RoundRow>(supabase.from('rounds').select('id, round_number, tee_time, status, published').eq('tour_id', tourId), 'load rounds'),
    runRows<{ id: string; name: string }>(supabase.from('tour_courses').select('id, name').eq('tour_id', tourId), 'load tour courses').catch(() => []),
  ]);
  const templateNumbers = new Set(template.map((round) => round.round_number));
  const extraRounds = existingRounds.filter((round) => !templateNumbers.has(Number(round.round_number)) && round.status !== 'complete');
  const extraRoundIds = extraRounds.map((round) => round.id);
  const [extraMatches, extraPrizeResults] = extraRoundIds.length > 0 ? await Promise.all([
    runRows<{ round_id: string }>(supabase.from('matches').select('round_id').in('round_id', extraRoundIds).limit(1), 'extra round matches'),
    runRows<{ round_id: string }>(supabase.from('round_prize_results').select('round_id').in('round_id', extraRoundIds).limit(1), 'extra round prize results').catch(() => []),
  ]) : [[], []];
  const protectedExtraRoundIds = new Set([...extraMatches, ...extraPrizeResults].map((row) => row.round_id));
  const emptyExtraRounds = extraRounds.filter((round) => !protectedExtraRoundIds.has(round.id));
  const warnings = extraRounds.length > 0 ? [`Extra non-complete rounds remain outside the agreed 2026 four-round template: ${extraRounds.map((round) => `round ${round.round_number}`).join(', ')}. Review and delete safe empty extras manually if required.`] : [];
  if (emptyExtraRounds.length > 0) warnings.push(`Safe empty extra rounds detected: ${emptyExtraRounds.map((round) => `round ${round.round_number}`).join(', ')}. They were not deleted automatically.`);

  for (const round of template) {
    const existing = existingRounds.find((candidate) => Number(candidate.round_number) === round.round_number);
    const courseId = courseRows.find((course) => course.name.toLowerCase() === round.course_name.toLowerCase())?.id ?? null;
    const row = { tour_id: tourId, ...round, course_id: courseId, tee_time: existing?.tee_time || null, notes: notes(round.session), published: existing?.published ?? false };
    if (existing) {
      if (existing.status === 'complete') continue;
      const { error } = await supabase.from('rounds').update(row).eq('id', existing.id).eq('tour_id', tourId);
      if (error) throw new Error(`update 2026 round ${round.round_number}: ${error.message}`);
    } else {
      const { error } = await supabase.from('rounds').insert({ id: crypto.randomUUID(), ...row });
      if (error) throw new Error(`create 2026 round ${round.round_number}: ${error.message}`);
    }
  }

  const [roundRows, itemRows] = await Promise.all([
    runRows<Record<string, unknown>>(supabase.from('rounds').select('*').eq('tour_id', tourId).order('round_number', { ascending: true }), 'rounds'),
    runRows<Record<string, unknown>>(supabase.from('tour_itinerary_items').select('*').eq('tour_id', tourId).order('sort_order', { ascending: true }), 'itinerary'),
  ]);
  for (const round of roundRows) await syncRequiredMarketDeadlinesForRound(supabase, String(round.id));
  return jsonResponse(200, { ok: true, rounds: roundRows.map(mapRound), itineraryItems: itemRows.map(mapTourItineraryItem), warnings });
});
