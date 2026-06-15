import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, withAdminSupabase } from './_adminSupabase';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id || !tourId) return badRequest('Handbook section ID and tour ID are required.');
  const removed = await supabase.from('tour_handbook_sections').delete().eq('id', id).eq('tour_id', tourId);
  if (removed.error) throw new Error(`delete handbook section: ${removed.error.message}`);
  await writeAuditLog(supabase, session, 'handbook.section.deleted', 'tour', tourId, { id });
  return jsonResponse(200, { ok: true, deletedHandbookSectionId: id });
});
