import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
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
  const isTest = body.isTest === true;

  if (!name) return badRequest('Tour name is required.');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return badRequest('Tour year must be a sensible number.');
  if (!status || !allowedStatuses.includes(status)) return badRequest('Tour status is invalid.');
  if (!isValidTimeZone(timezone)) return badRequest('Tour timezone must be a valid IANA timezone, for example Europe/Lisbon.');
  const dateError = validateTourDateRange(startDate, endDate, status !== 'archived');
  if (dateError) return badRequest(dateError);
  if (isTest && !/^QA TEST TOUR\b/i.test(name)) {
    return badRequest('Disposable test tours must have a name beginning “QA TEST TOUR”.');
  }
  if (id) {
    const existing = await runRows<{ id: string; is_test: boolean }>(
      supabase.from('tours').select('id, is_test').eq('id', id).limit(1),
      'find tour before save',
    );
    if (existing.length === 0) return badRequest('Tour does not exist.');
    if (Boolean(existing[0].is_test) !== isTest) {
      return badRequest('A tour’s disposable-test status cannot be changed after creation.');
    }
  }

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
    is_test: isTest,
  };

  const query = id
    ? supabase.from('tours').update(row).eq('id', id).select('*').single()
    : supabase.from('tours').insert(row).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save tour');
  if (saved.start_date !== startDate || saved.end_date !== endDate) {
    throw new Error('save tour: the database did not persist the submitted start and end dates');
  }

  return jsonResponse(200, { ok: true, tour: mapTour(saved) });
});
