import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { mapTour } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type SupabaseError = { message: string } | null;
type MutationResult<T> = { data: T[] | null; error: SupabaseError };

function isMissingCurrentPublicColumn(error: SupabaseError): boolean {
  return /is_current_public|schema cache|column/i.test(error?.message ?? '');
}

async function runMutation<T>(query: PromiseLike<MutationResult<T>>, label: string): Promise<{ ok: true; rows: T[] } | { ok: false; label: string; message: string; missingMigration: boolean }> {
  const { data, error } = await query;
  if (!error) return { ok: true, rows: data ?? [] };
  return { ok: false, label, message: error.message, missingMigration: isMissingCurrentPublicColumn(error) };
}

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  if (!tourId) return badRequest('Tour ID is required.');

  const tours = await runRows(supabase.from('tours').select('id').eq('id', tourId).limit(1), 'find current public tour target');
  if (tours.length === 0) return badRequest('Tour must exist before it can be made current public.');

  const warnings: string[] = [];
  let missingMigration = false;

  let unset = await runMutation(supabase.from('tours').update({ is_current_public: false }).eq('is_current_public', true).neq('id', tourId).select('id'), 'unset current public tours');
  if (!unset.ok) {
    warnings.push(`${unset.label}: ${unset.message}`);
    missingMigration ||= unset.missingMigration;
  }

  let set = await runMutation<Record<string, unknown>>(supabase.from('tours').update({ is_current_public: true }).eq('id', tourId).select('*'), 'set current public tour');
  if (!set.ok && unset.ok) {
    // If the first unset succeeded but PostgREST/schema cache briefly races, retry once after the cache reload migration has had a chance to settle.
    set = await runMutation<Record<string, unknown>>(supabase.from('tours').update({ is_current_public: true }).eq('id', tourId).select('*'), 'set current public tour retry');
  }
  if (!set.ok && !unset.ok) {
    // Do not leave the flow blocked after a partial failure: try to clear other tours once more, then set the selected tour again.
    unset = await runMutation(supabase.from('tours').update({ is_current_public: false }).eq('is_current_public', true).neq('id', tourId).select('id'), 'unset current public tours retry');
    if (!unset.ok) {
      warnings.push(`${unset.label}: ${unset.message}`);
      missingMigration ||= unset.missingMigration;
    }
    set = await runMutation<Record<string, unknown>>(supabase.from('tours').update({ is_current_public: true }).eq('id', tourId).select('*'), 'set current public tour after retry');
  }

  if (!set.ok) {
    missingMigration ||= set.missingMigration;
    return jsonResponse(missingMigration ? 409 : 500, {
      ok: false,
      missingMigration,
      message: missingMigration
        ? 'The database is missing tours.is_current_public or Supabase has not reloaded its schema cache. Apply migration 0011_live_admin_bet_punto_schema_repair.sql; it repairs publication columns and reloads the Supabase schema cache automatically.'
        : `Could not set the selected tour as current public: ${set.message}`,
      warnings,
    });
  }

  if (set.rows.length === 0) return badRequest('Tour must exist before it can be made current public.');

  return jsonResponse(200, { ok: true, tour: mapTour(set.rows[0]), warnings, missingMigration });
});
