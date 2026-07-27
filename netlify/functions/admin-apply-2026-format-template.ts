import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { mapRound, mapTourItineraryItem } from './_mappers';
import { syncRequiredMarketDeadlinesForRound } from './_betMarketDeadline';
import { installCourseTemplatesForTour } from './_courseTemplateInstaller';
import type { MatchFormat } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type RoundRow = { id: string; round_number: number; tee_time?: string | null; status?: string | null; published?: boolean | null };

type TemplateRound = { round_number: number; name: string; round_date: string; session: 'AM' | 'PM'; course_name: string; course_slug?: string; tee_time: string; format: MatchFormat; format_label: string; holes: 9 | 18; schedule_note: string; status: 'planned' };

const template: TemplateRound[] = [
  { round_number: 1, name: 'Friday Par 3 Pairs Scramble', round_date: '2026-11-06', session: 'PM', course_name: 'Amendoeira Par 3', tee_time: '19:20', format: 'scramble', format_label: 'Pairs Scramble (Scratch)', holes: 18, schedule_note: 'Minimum 6 tee shots each. Use Golf Gamebook for live secondary-format scoring throughout the tour.', status: 'planned' },
  { round_number: 2, name: 'Saturday Faldo 4BBB', round_date: '2026-11-07', session: 'AM', course_name: 'Faldo Course', course_slug: 'faldo', tee_time: '10:00', format: 'better_ball', format_label: '4BBB (Full Handicap)', holes: 18, schedule_note: 'Tee times 10:00–10:50. Secondary format: pairs Stableford.', status: 'planned' },
  { round_number: 3, name: 'Sunday Old Course Singles', round_date: '2026-11-08', session: 'AM', course_name: 'Old Course', course_slug: 'old-course', tee_time: '11:24', format: 'singles', format_label: 'Singles (Full Handicap)', holes: 18, schedule_note: 'Tee times 11:24–12:14. Secondary format: individual Stableford.', status: 'planned' },
  { round_number: 4, name: 'Monday O’Connor 9-hole 4BBB', round_date: '2026-11-09', session: 'AM', course_name: 'O’Connor Course', course_slug: 'oconnor', tee_time: '10:00', format: 'better_ball', format_label: '4BBB (Full Handicap)', holes: 9, schedule_note: 'Tee times 10:00–10:50. Secondary format: pairs Stableford.', status: 'planned' },
];

function notes(round: TemplateRound) { return `[Session: ${round.session}]\n${round.schedule_note}`; }

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  if (!tourId) return badRequest('Tour ID is required.');
  const tours = await runRows<{ id: string; year: number }>(supabase.from('tours').select('id, year').eq('id', tourId).limit(1), 'find tour');
  if (tours.length === 0) return badRequest('Tour must exist.');
  if (Number(tours[0].year) !== 2026) return badRequest('The 2026 format template can only be applied to a 2026 tour.');

  const installedGuides = await installCourseTemplatesForTour(
    supabase,
    tourId,
    ['faldo', 'oconnor', 'old-course'],
    { published: true, showOnHome: true },
  );
  const [existingRounds, courseRows] = await Promise.all([
    runRows<RoundRow>(supabase.from('rounds').select('id, round_number, tee_time, status, published').eq('tour_id', tourId), 'load rounds'),
    runRows<{ id: string; slug: string; name: string }>(supabase.from('tour_courses').select('id, slug, name').eq('tour_id', tourId), 'load tour courses'),
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
    const courseId = round.course_slug
      ? courseRows.find((course) => course.slug === round.course_slug)?.id ?? null
      : null;
    const { course_slug: _courseSlug, schedule_note: _scheduleNote, ...roundValues } = round;
    const roundId = existing?.id ?? crypto.randomUUID();
    const row = { tour_id: tourId, ...roundValues, course_id: courseId, notes: notes(round), published: existing?.published ?? false };
    if (existing) {
      if (existing.status === 'complete') continue;
      const { error } = await supabase.from('rounds').update(row).eq('id', existing.id).eq('tour_id', tourId);
      if (error) throw new Error(`update 2026 round ${round.round_number}: ${error.message}`);
    } else {
      const { error } = await supabase.from('rounds').insert({ id: roundId, ...row });
      if (error) throw new Error(`create 2026 round ${round.round_number}: ${error.message}`);
    }
    const matchUpdate = await supabase.from('matches').update({ format: round.format }).eq('round_id', roundId).in('status', ['draft', 'planned']);
    if (matchUpdate.error) throw new Error(`update 2026 round ${round.round_number} match formats: ${matchUpdate.error.message}`);
  }

  const [roundRows, itemRows] = await Promise.all([
    runRows<Record<string, unknown>>(supabase.from('rounds').select('*').eq('tour_id', tourId).order('round_number', { ascending: true }), 'rounds'),
    runRows<Record<string, unknown>>(supabase.from('tour_itinerary_items').select('*').eq('tour_id', tourId).order('sort_order', { ascending: true }), 'itinerary'),
  ]);
  for (const round of roundRows) await syncRequiredMarketDeadlinesForRound(supabase, String(round.id));
  return jsonResponse(200, {
    ok: true,
    rounds: roundRows.map(mapRound),
    itineraryItems: itemRows.map(mapTourItineraryItem),
    installedCourseGuides: installedGuides.courses,
    createdCourseGuideSlugs: installedGuides.createdSlugs,
    warnings,
  });
});
