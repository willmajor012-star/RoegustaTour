import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTour } from './_mappers';
import type { Tour } from '../../src/lib/types';
import { isValidTimeZone } from '../../src/lib/tourTime';
import { validateTourDateRange } from '../../src/lib/tourValidation';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const allowedStatuses: Tour['status'][] = ['planned', 'active', 'complete', 'archived'];

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const name = optionalString(body.name);
  const year = typeof body.year === 'number' ? body.year : Number(body.year);
  const status = optionalString(body.status) as Tour['status'] | null;
  const timezone = optionalString(body.timezone) ?? 'Europe/Lisbon';
  const startDate = optionalString(body.startDate);
  const endDate = optionalString(body.endDate);

  if (!name) return badRequest('Tour name is required.');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return badRequest('Tour year must be a sensible number.');
  if (!status || !allowedStatuses.includes(status)) return badRequest('Tour status is invalid.');
  if (!isValidTimeZone(timezone)) return badRequest('Tour timezone must be a valid IANA timezone, for example Europe/Lisbon.');
  const dateError = validateTourDateRange(startDate, endDate);
  if (dateError) return badRequest(dateError);

  const row = {
    id: id ?? crypto.randomUUID(),
    name,
    year,
    location: optionalString(body.location),
    timezone,
    start_date: startDate,
    end_date: endDate,
    status,
    description: optionalString(body.description),
  };

  const query = id
    ? supabase.from('tours').update(row).eq('id', id).select('*').single()
    : supabase.from('tours').insert(row).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save tour');

  return jsonResponse(200, { ok: true, tour: mapTour(saved) });
});
