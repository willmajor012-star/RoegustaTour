import { jsonResponse, readAdminSession, type FunctionEvent, type FunctionResponse } from './_adminAuth';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed', message: 'Use GET to check an admin session.' }, { allow: 'GET' });
  }

  const session = await readAdminSession(event);
  if (!session) {
    return jsonResponse(401, {
      error: 'admin_session_required',
      message: 'A valid admin session is required.',
    });
  }

  return jsonResponse(200, {
    ok: true,
    session,
  });
};
