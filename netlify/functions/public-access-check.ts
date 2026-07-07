import { createServerSupabaseClient } from './_supabase';
import { readPublicAccessSession } from './_publicAccess';

type Event = { headers?: Record<string, string | undefined> };
function json(statusCode: number, payload: unknown) { return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) }; }

export const handler = async (event: Event) => {
  try {
    const session = await readPublicAccessSession(event, createServerSupabaseClient());
    return session ? json(200, { ok: true }) : json(401, { ok: false, error: 'public_access_required', message: 'Enter the tour password to continue.' });
  } catch (error) {
    return json(503, { ok: false, error: 'public_access_configuration_error', message: error instanceof Error ? error.message : 'Public access is not configured.' });
  }
};
