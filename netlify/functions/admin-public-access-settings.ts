import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { createPasswordSalt, getPublicAccessSetting, hashPublicPassword } from './_publicAccess';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, event.httpMethod === 'GET' ? 'GET' : 'POST', async (supabase, body, session) => {
  if (event.httpMethod === 'GET') {
    const setting = await getPublicAccessSetting(supabase);
    return jsonResponse(200, { ok: true, configured: setting.configured, sessionVersion: setting.sessionVersion });
  }

  const password = optionalString(body.password);
  const forceExpire = body.forceExpire !== false;
  if (!password || password.length < 8) return badRequest('Public password must be at least 8 characters.');
  const currentRows = await runRows<{ session_version: number | null }>(supabase.from('public_access_settings').select('session_version').eq('id', 'default').limit(1), 'load public access setting');
  const nextVersion = (currentRows[0]?.session_version ?? 1) + (forceExpire ? 1 : 0);
  const salt = createPasswordSalt();
  const row = {
    id: 'default',
    password_hash: await hashPublicPassword(password, salt),
    password_salt: salt,
    session_version: nextVersion,
    updated_at: new Date().toISOString(),
    updated_by: session.actorLabel,
  };
  const saved = await runSingle<{ session_version: number }>(supabase.from('public_access_settings').upsert(row, { onConflict: 'id' }).select('session_version').single(), 'save public access setting');
  return jsonResponse(200, { ok: true, configured: true, sessionVersion: saved.session_version });
});
