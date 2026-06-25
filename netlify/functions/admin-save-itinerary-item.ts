import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourItineraryItem } from './_mappers';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const id = optionalString(body.id);
  const activity = optionalString(body.activity);
  const sortOrder = Number(body.sortOrder ?? 0);
  if (!tourId) return badRequest('Tour ID is required.');
  if (!activity) return badRequest('Activity is required.');
  if (!Number.isFinite(sortOrder)) return badRequest('Sort order must be numeric.');
  const values = {
    tour_id: tourId,
    item_date: optionalString(body.itemDate) || null,
    day_label: optionalString(body.dayLabel) || null,
    time_label: optionalString(body.timeLabel) || null,
    activity,
    location: optionalString(body.location) || null,
    notes: optionalString(body.notes) || null,
    is_placeholder: Boolean(body.isPlaceholder),
    sort_order: sortOrder,
    source_type: optionalString(body.sourceType) || null,
    source_id: optionalString(body.sourceId) || null,
  };
  const query = id
    ? supabase.from('tour_itinerary_items').update(values).eq('id', id).eq('tour_id', tourId).select('*').single()
    : supabase.from('tour_itinerary_items').insert({ id: crypto.randomUUID(), ...values }).select('*').single();
  const row = await runSingle<Record<string, unknown>>(query, 'save itinerary item');
  await writeAuditLog(supabase, session, id ? 'itinerary.item.updated' : 'itinerary.item.created', 'tour', tourId, { id: id ?? row.id });
  return jsonResponse(200, { ok: true, itineraryItem: mapTourItineraryItem(row) });
});
