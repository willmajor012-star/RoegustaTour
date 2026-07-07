import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { mapRound, mapTourItineraryItem } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type RoundRow = { id: string; round_number: number; tee_time?: string | null; status?: string | null };

const template = [
  { round_number: 1, name: 'Saturday AM 4BBB', round_date: '2026-11-07', session: 'AM', course_name: 'Faldo Course', format_label: '4BBB', holes: 18, status: 'planned' },
  { round_number: 2, name: 'Saturday PM Par 3 Scramble', round_date: '2026-11-07', session: 'PM', course_name: 'Par 3 Course', format_label: 'Scramble', holes: 9, status: 'planned' },
  { round_number: 3, name: 'Sunday Singles', round_date: '2026-11-08', session: 'AM', course_name: 'Old Course', format_label: 'Singles', holes: 18, status: 'planned' },
  { round_number: 4, name: 'Monday 9-hole 4BBB', round_date: '2026-11-09', session: 'AM', course_name: 'Course TBC', format_label: '4BBB', holes: 9, status: 'planned' },
];

const itinerary = [
  { item_date: '2026-11-06', day_label: 'Friday 6 Nov', time_label: 'TBC', activity: 'Arrival / travel day', location: null, notes: 'Flights, transfers, accommodation and dinner TBC', sort_order: 10 },
  { item_date: '2026-11-07', day_label: 'Saturday 7 Nov', time_label: 'AM', activity: 'Faldo Course 4BBB', location: 'Faldo Course', notes: null, sort_order: 20 },
  { item_date: '2026-11-07', day_label: 'Saturday 7 Nov', time_label: 'PM', activity: 'Par 3 Course scramble', location: 'Par 3 Course', notes: null, sort_order: 30 },
  { item_date: '2026-11-08', day_label: 'Sunday 8 Nov', time_label: 'TBC', activity: 'Old Course singles', location: 'Old Course', notes: null, sort_order: 40 },
  { item_date: '2026-11-09', day_label: 'Monday 9 Nov', time_label: 'TBC', activity: 'Course TBC 9-hole 4BBB', location: 'Course TBC', notes: 'Departure details TBC', sort_order: 50 },
];

function notes(session: string) { return `[Session: ${session}]`; }

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  if (!tourId) return badRequest('Tour ID is required.');
  const tours = await runRows<{ id: string; year: number }>(supabase.from('tours').select('id, year').eq('id', tourId).limit(1), 'find tour');
  if (tours.length === 0) return badRequest('Tour must exist.');
  if (Number(tours[0].year) !== 2026) return badRequest('The 2026 format template can only be applied to a 2026 tour.');

  const existingRounds = await runRows<RoundRow>(supabase.from('rounds').select('id, round_number, tee_time, status').eq('tour_id', tourId), 'load rounds');
  for (const round of template) {
    const existing = existingRounds.find((candidate) => Number(candidate.round_number) === round.round_number);
    const row = { tour_id: tourId, ...round, tee_time: existing?.tee_time || 'TBC', notes: notes(round.session), published: true };
    if (existing) {
      if (existing.status === 'complete') continue;
      const { error } = await supabase.from('rounds').update(row).eq('id', existing.id).eq('tour_id', tourId);
      if (error) throw new Error(`update 2026 round ${round.round_number}: ${error.message}`);
    } else {
      const { error } = await supabase.from('rounds').insert({ id: crypto.randomUUID(), ...row });
      if (error) throw new Error(`create 2026 round ${round.round_number}: ${error.message}`);
    }
  }

  const stale = await runRows<{ id: string; activity: string; is_placeholder: boolean }>(supabase.from('tour_itinerary_items').select('id, activity, is_placeholder').eq('tour_id', tourId).eq('item_date', '2026-11-06'), 'load stale Friday itinerary');
  const staleIds = stale.filter((item) => item.is_placeholder && /golf|practice|opening match/i.test(item.activity)).map((item) => item.id);
  if (staleIds.length > 0) {
    const { error } = await supabase.from('tour_itinerary_items').delete().eq('tour_id', tourId).in('id', staleIds);
    if (error) throw new Error(`remove stale Friday itinerary: ${error.message}`);
  }

  const existingItems = await runRows<{ id: string; item_date: string | null; activity: string }>(supabase.from('tour_itinerary_items').select('id, item_date, activity').eq('tour_id', tourId), 'load itinerary');
  for (const item of itinerary) {
    const exists = existingItems.some((candidate) => candidate.item_date === item.item_date && candidate.activity.toLowerCase() === item.activity.toLowerCase());
    if (!exists) {
      const { error } = await supabase.from('tour_itinerary_items').insert({ id: crypto.randomUUID(), tour_id: tourId, ...item, is_placeholder: true, source_type: 'template_2026', source_id: item.activity.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
      if (error) throw new Error(`create 2026 itinerary item: ${error.message}`);
    }
  }

  const [roundRows, itemRows] = await Promise.all([
    runRows<Record<string, unknown>>(supabase.from('rounds').select('*').eq('tour_id', tourId).order('round_number', { ascending: true }), 'rounds'),
    runRows<Record<string, unknown>>(supabase.from('tour_itinerary_items').select('*').eq('tour_id', tourId).order('sort_order', { ascending: true }), 'itinerary'),
  ]);
  return jsonResponse(200, { ok: true, rounds: roundRows.map(mapRound), itineraryItems: itemRows.map(mapTourItineraryItem) });
});
