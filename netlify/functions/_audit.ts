import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminSession } from './_adminAuth';

export async function writeAuditLog(
  supabase: SupabaseClient,
  session: AdminSession | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_label: session?.actorLabel ?? 'Roegusta admin',
    action,
    entity_type: entityType,
    entity_id: entityId,
    payload,
  });
  if (error) throw new Error(`write audit log: ${error.message}`);
}
