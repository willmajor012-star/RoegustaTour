import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonResponse, parseJsonBody, requireAdminSession, type AdminSession, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { createServerSupabaseClient } from './_supabase';

export type Row = Record<string, unknown>;

type SupabaseError = { message: string } | null;

export function badRequest(message: string): FunctionResponse {
  return jsonResponse(400, { ok: false, message });
}

function friendlySchemaMessage(message: string): string {
  if (/schema cache|column .*published|published .*column|is_current_public|Could not find .* column/i.test(message)) {
    return "The live database is missing the latest publication columns or Supabase has not reloaded its schema cache. Apply migration 0011_live_admin_bet_punto_schema_repair.sql; it repairs publication and Bet Punto columns and reloads the Supabase schema cache automatically.";
  }
  return message;
}

export function methodNotAllowed(): FunctionResponse {
  return jsonResponse(405, { ok: false, message: 'Method not allowed.' });
}

export async function withAdminSupabase(
  event: FunctionEvent,
  method: string,
  action: (supabase: SupabaseClient, body: Record<string, unknown>, session: AdminSession) => Promise<FunctionResponse>,
): Promise<FunctionResponse> {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, {});
  if (event.httpMethod !== method) return methodNotAllowed();

  const session = await requireAdminSession(event);
  if ('statusCode' in session) return session;

  try {
    const body = method === 'GET' ? {} : parseJsonBody(event);
    const supabase = createServerSupabaseClient();
    return await action(supabase, body, session);
  } catch (error) {
    console.error('Admin Supabase request failed:', error);
    return jsonResponse(500, { ok: false, message: error instanceof Error ? friendlySchemaMessage(error.message) : 'Admin request could not be completed.' });
  }
}

export async function runRows<T = Row>(query: PromiseLike<{ data: T[] | null; error: SupabaseError }>, label: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? [];
}

export async function runSingle<T = Row>(query: PromiseLike<{ data: T | null; error: SupabaseError }>, label: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: no row returned`);
  return data;
}

export function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
