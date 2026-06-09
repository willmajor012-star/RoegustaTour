import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapPlayer } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const displayName = optionalString(body.displayName);
  if (!displayName) return badRequest('Display name is required.');

  const id = optionalString(body.id) ?? crypto.randomUUID();
  const active = typeof body.active === 'boolean' ? body.active : true;
  const row = {
    id,
    display_name: displayName,
    nickname: optionalString(body.nickname),
    initials: optionalString(body.initials),
    active,
  };

  const query = optionalString(body.id)
    ? supabase.from('players').update(row).eq('id', id).select('*').single()
    : supabase.from('players').insert(row).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save player');

  return jsonResponse(200, { ok: true, player: mapPlayer(saved) });
});
