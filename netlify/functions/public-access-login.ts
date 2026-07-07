import { createServerSupabaseClient } from './_supabase';
import { createPublicAccessCookie, verifyPublicPassword } from './_publicAccess';

type Event = { httpMethod: string; body: string | null };
function json(statusCode: number, payload: unknown, headers?: Record<string, string>) { return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', ...(headers ?? {}) }, body: JSON.stringify(payload) }; }

export const handler = async (event: Event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed.' });
  try {
    const body = event.body ? JSON.parse(event.body) as { password?: unknown } : {};
    const password = typeof body.password === 'string' ? body.password : '';
    const supabase = createServerSupabaseClient();
    const result = await verifyPublicPassword(supabase, password);
    if (!result.ok) return json(401, { ok: false, error: 'invalid_public_password', message: 'Incorrect password.' });
    const cookie = await createPublicAccessCookie(result.sessionVersion);
    return json(200, { ok: true, expiresInDays: 180, configured: result.configured }, { 'Set-Cookie': cookie });
  } catch (error) {
    return json(503, { ok: false, error: 'public_access_configuration_error', message: error instanceof Error ? error.message : 'Public access is not configured.' });
  }
};
