import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminSession } from './_adminAuth';

export async function writeAuditLog(
  supabase: SupabaseClient,
  session: AdminSession | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const { error } = await supabase.from('audit_log').insert({
    actor_label: session?.actorLabel ?? 'Roegusta admin',
    action,
    entity_type: entityType,
    entity_id: entityId,
    payload,
  });
  if (error) {
    // The user-facing write has often already committed (for example an atomic
    // settlement RPC). Do not report that operation as failed merely because
    // its secondary audit insert could not be recorded.
    console.error(`write audit log: ${error.message}`);
    return false;
  }
  return true;
}
