import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

export const handler: (event: FunctionEvent) => Promise<FunctionResponse> = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id || !tourId) return badRequest('Course ID and tour ID are required.');

  const courses = await runRows<{ id: string; tour_id: string }>(supabase.from('tour_courses').select('id, tour_id').eq('id', id).limit(1), 'find course');
  if (courses.length === 0) return badRequest('Course does not exist.');
  if (courses[0].tour_id !== tourId) return badRequest('Course does not belong to this tour.');
  const rounds = await runRows<{ id: string }>(supabase.from('rounds').select('id').eq('course_id', id).limit(1), 'find linked rounds');
  if (rounds.length > 0) return badRequest('This course is linked to a round. Select a different course on that round before deleting it.');

  const deleted = await supabase.from('tour_courses').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete course: ${deleted.error.message}`);
  return jsonResponse(200, { ok: true, deletedCourseId: id });
});
