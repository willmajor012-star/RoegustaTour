import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, withAdminSupabase } from './_adminSupabase';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const id = optionalString(body.id);
  if (!tourId) return badRequest('Tour ID is required.');
  if (!id) return badRequest('Itinerary item ID is required.');
  const removed = await supabase.from('tour_itinerary_items').delete().eq('id', id).eq('tour_id', tourId);
  if (removed.error) throw new Error(`delete itinerary item: ${removed.error.message}`);
  await writeAuditLog(supabase, session, 'itinerary.item.deleted', 'tour', tourId, { id });
  return jsonResponse(200, { ok: true, deletedItineraryItemId: id });
});
