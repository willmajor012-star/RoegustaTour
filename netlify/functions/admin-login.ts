import { createAdminSession, jsonResponse, optionsResponse, parseJsonBody, verifyAdminPin, type FunctionEvent, type FunctionResponse } from './_adminAuth';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed', message: 'Use POST to create an admin session.' }, { allow: 'POST, OPTIONS' });
  }

  try {
    const body = parseJsonBody(event);
    const pin = typeof body.pin === 'string' ? body.pin : '';
    const actorLabel = typeof body.actorLabel === 'string' ? body.actorLabel : 'Roegusta admin';

    if (!pin) {
      return jsonResponse(400, { error: 'pin_required', message: 'Enter the shared admin PIN.' });
    }

    const pinIsValid = await verifyAdminPin(pin);
    if (!pinIsValid) {
      return jsonResponse(401, { error: 'invalid_pin', message: 'The admin PIN was not recognised.' });
    }

    const { token, session } = await createAdminSession(actorLabel);

    return jsonResponse(200, {
      token,
      session,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: 'admin_login_failed',
      message: error instanceof Error ? error.message : 'Unable to create an admin session.',
    });
  }
};
