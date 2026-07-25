import { writeAuditLog } from './_audit';
import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourTeamDayKit } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  const teamId = optionalString(body.teamId);
  const kitDate = optionalString(body.kitDate);
  const colourLabel = optionalString(body.colourLabel);
  const sortOrder = Number(body.sortOrder ?? 0);
  if (!tourId || !teamId || !kitDate || !colourLabel) return badRequest('Tour, team, date and shirt colour are required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kitDate)) return badRequest('Shirt date must use YYYY-MM-DD.');
  if (!Number.isFinite(sortOrder)) return badRequest('Sort order must be numeric.');

  const teams = await runRows<{ id: string }>(supabase.from('tour_teams').select('id').eq('id', teamId).eq('tour_id', tourId).limit(1), 'validate shirt team');
  if (teams.length === 0) return badRequest('Team must belong to the selected tour.');

  const values = {
    tour_id: tourId,
    team_id: teamId,
    kit_date: kitDate,
    colour_label: colourLabel,
    sort_order: sortOrder,
  };
  const matching = id ? [] : await runRows<{ id: string }>(
    supabase.from('tour_team_day_kit').select('id').eq('tour_id', tourId).eq('team_id', teamId).eq('kit_date', kitDate).limit(1),
    'find existing team shirt colour',
  );
  const targetId = id ?? matching[0]?.id;
  const query = targetId
    ? supabase.from('tour_team_day_kit').update(values).eq('id', targetId).eq('tour_id', tourId).select('*').single()
    : supabase.from('tour_team_day_kit').insert({ id: crypto.randomUUID(), ...values }).select('*').single();
  const row = await runSingle<Record<string, unknown>>(query, 'save team shirt colour');
  await writeAuditLog(supabase, session, targetId ? 'tour.kit.updated' : 'tour.kit.saved', 'tour', tourId, { id: row.id, teamId, kitDate });
  return jsonResponse(200, { ok: true, teamDayKit: mapTourTeamDayKit(row) });
});
