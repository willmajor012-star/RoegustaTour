import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourItineraryItem } from './_mappers';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const id = optionalString(body.id);
  const activity = optionalString(body.activity);
  const sourceType = optionalString(body.sourceType);
  const itemDate = optionalString(body.itemDate);
  const timeLabel = optionalString(body.timeLabel);
  const endTimeLabel = optionalString(body.endTimeLabel);
  const isPlaceholder = Boolean(body.isPlaceholder);
  if (!tourId) return badRequest('Tour ID is required.');
  if (!itemDate || !/^\d{4}-\d{2}-\d{2}$/.test(itemDate)) return badRequest('A valid itinerary date is required.');
  if (!activity) return badRequest('Activity is required.');
  if (!sourceType || !['flight', 'travel', 'accommodation', 'dinner'].includes(sourceType)) return badRequest('Itinerary type must be flight, travel, accommodation or dinner.');
  if (timeLabel && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeLabel)) return badRequest('Time must use HH:MM.');
  if (endTimeLabel && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTimeLabel)) return badRequest('Arrival time must use HH:MM.');
  if (sourceType === 'flight' && !isPlaceholder && (!timeLabel || !endTimeLabel)) return badRequest('Flights require departure and landing times, or must be marked TBC.');
  const automaticSortOrder = timeLabel
    ? (Number(timeLabel.slice(0, 2)) * 60) + Number(timeLabel.slice(3, 5))
    : 24 * 60;
  const values = {
    tour_id: tourId,
    item_date: itemDate,
    day_label: optionalString(body.dayLabel) || null,
    time_label: timeLabel,
    end_time_label: endTimeLabel,
    activity,
    location: optionalString(body.location) || null,
    notes: optionalString(body.notes) || null,
    is_placeholder: isPlaceholder,
    sort_order: automaticSortOrder,
    source_type: sourceType,
    source_id: optionalString(body.sourceId) || null,
  };
  const query = id
    ? supabase.from('tour_itinerary_items').update(values).eq('id', id).eq('tour_id', tourId).select('*').single()
    : supabase.from('tour_itinerary_items').insert({ id: crypto.randomUUID(), ...values }).select('*').single();
  const row = await runSingle<Record<string, unknown>>(query, 'save itinerary item');
  await writeAuditLog(supabase, session, id ? 'itinerary.item.updated' : 'itinerary.item.created', 'tour', tourId, { id: id ?? row.id });
  return jsonResponse(200, { ok: true, itineraryItem: mapTourItineraryItem(row) });
});
