import { writeAuditLog } from './_audit';
import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, withAdminSupabase } from './_adminSupabase';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id || !tourId) return badRequest('Tour and shirt colour IDs are required.');
  const removed = await supabase.from('tour_team_day_kit').delete().eq('id', id).eq('tour_id', tourId);
  if (removed.error) throw new Error(`delete team shirt colour: ${removed.error.message}`);
  await writeAuditLog(supabase, session, 'tour.kit.deleted', 'tour', tourId, { id });
  return jsonResponse(200, { ok: true, deletedTeamDayKitId: id });
});
