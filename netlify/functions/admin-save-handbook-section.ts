import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourHandbookSection } from './_mappers';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const id = optionalString(body.id);
  const sectionKey = optionalString(body.sectionKey);
  const title = optionalString(body.title);
  const bodyText = optionalString(body.body);
  const sortOrder = Number(body.sortOrder ?? 0);
  if (!tourId) return badRequest('Tour ID is required.');
  if (!sectionKey) return badRequest('Section key is required.');
  if (!title) return badRequest('Title is required.');
  if (!Number.isFinite(sortOrder)) return badRequest('Sort order must be numeric.');
  const values = { tour_id: tourId, section_key: sectionKey, title, body: bodyText || null, sort_order: sortOrder };
  const query = id
    ? supabase.from('tour_handbook_sections').update(values).eq('id', id).eq('tour_id', tourId).select('*').single()
    : supabase.from('tour_handbook_sections').upsert({ id: crypto.randomUUID(), ...values }, { onConflict: 'tour_id,section_key' }).select('*').single();
  const row = await runSingle<Record<string, unknown>>(query, 'save handbook section');
  await writeAuditLog(supabase, session, id ? 'handbook.section.updated' : 'handbook.section.saved', 'tour', tourId, { sectionKey });
  return jsonResponse(200, { ok: true, handbookSection: mapTourHandbookSection(row) });
});
