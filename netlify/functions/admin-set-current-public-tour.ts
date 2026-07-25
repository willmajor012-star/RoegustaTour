import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { mapTour } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  if (!tourId) return badRequest('Tour ID is required.');

  const rows = await runRows<Record<string, unknown>>(
    supabase.rpc('admin_set_current_public_tour', { p_tour_id: tourId }),
    'set current public tour atomically',
  );
  if (rows.length === 0) return badRequest('Tour must exist before it can be made current public.');

  return jsonResponse(200, { ok: true, tour: mapTour(rows[0]) });
});
