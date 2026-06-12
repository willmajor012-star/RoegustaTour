import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTour } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  if (!tourId) return badRequest('Tour ID is required.');

  const tours = await runRows(supabase.from('tours').select('id').eq('id', tourId).limit(1), 'find current public tour target');
  if (tours.length === 0) return badRequest('Tour must exist before it can be made current public.');

  await runRows(supabase.from('tours').update({ is_current_public: false }).eq('is_current_public', true).select('id'), 'unset current public tours');
  const saved = await runSingle<Record<string, unknown>>(supabase.from('tours').update({ is_current_public: true }).eq('id', tourId).select('*').single(), 'set current public tour');

  // TODO: insert audit_log row for current-public tour changes when the audit schema/helper lands.
  return jsonResponse(200, { ok: true, tour: mapTour(saved) });
});
