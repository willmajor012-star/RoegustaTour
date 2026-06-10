import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapRound } from './_mappers';
import type { MatchFormat, Round } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const allowedStatuses: Round['status'][] = ['draft', 'planned', 'active', 'complete'];
const allowedFormats: MatchFormat[] = ['singles', 'better_ball', 'foursomes', 'scramble', 'custom'];
const formatLabels: Record<MatchFormat, string> = {
  singles: 'Singles',
  better_ball: 'Better ball',
  foursomes: 'Foursomes',
  scramble: 'Scramble',
  custom: 'Custom',
};

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  const roundNumber = typeof body.roundNumber === 'number' ? body.roundNumber : Number(body.roundNumber);
  const name = optionalString(body.name);
  const status = optionalString(body.status) as Round['status'] | null;
  const format = (optionalString(body.format) ?? 'custom') as MatchFormat;

  if (!tourId) return badRequest('Tour ID is required.');
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 99) return badRequest('Round number is invalid.');
  if (!name) return badRequest('Round name is required.');
  if (!status || !allowedStatuses.includes(status)) return badRequest('Round status is invalid.');
  if (!allowedFormats.includes(format)) return badRequest('Round format is invalid.');

  const tours = await runRows(supabase.from('tours').select('id').eq('id', tourId).limit(1), 'find round tour');
  if (tours.length === 0) return badRequest('Tour must exist.');

  if (id) {
    const rounds = await runRows(supabase.from('rounds').select('id, tour_id').eq('id', id).limit(1), 'find round');
    if (rounds.length === 0) return badRequest('Round must exist.');
    if (rounds[0].tour_id !== tourId) return badRequest('Round does not belong to this tour.');
  }

  const row = {
    id: id ?? crypto.randomUUID(),
    tour_id: tourId,
    round_number: roundNumber,
    name,
    round_date: optionalString(body.roundDate),
    course_name: optionalString(body.courseName),
    tee_time: optionalString(body.teeTime),
    format_label: optionalString(body.formatLabel) ?? formatLabels[format],
    notes: optionalString(body.notes),
    status,
  };

  const query = id
    ? supabase.from('rounds').update(row).eq('id', id).select('*').single()
    : supabase.from('rounds').insert(row).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save round');

  return jsonResponse(200, { ok: true, round: mapRound(saved) });
});
