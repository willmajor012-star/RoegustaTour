import { withAdminSupabase, badRequest } from './_adminSupabase';
import { jsonResponse, type FunctionEvent } from './_adminAuth';
import { applyOperationsAction, readOperations } from './_tourOperations';
export const handler = (event: FunctionEvent) => withAdminSupabase(event, event.httpMethod === 'GET' ? 'GET' : 'POST', async (db, body, session) => {
  const tourId = event.queryStringParameters?.tourId ?? body.tourId;
  if (typeof tourId !== 'string') return badRequest('Choose a tour.');
  try {
    const bundle = await readOperations(db, tourId, true);
    return jsonResponse(200, event.httpMethod === 'GET' ? bundle : await applyOperationsAction(db, bundle, String(body.action), (body.payload ?? {}) as Record<string, unknown>, Number(body.version), session.actorLabel));
  } catch (error) { return jsonResponse(409, { message: error instanceof Error ? error.message : 'Tour update failed.' }); }
});
