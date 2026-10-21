import type { FunctionEvent } from './_adminAuth';
import { badRequest, withAdminSupabase } from './_adminSupabase';
// Retired endpoint retained so older clients receive a clear error instead of
// recreating the superseded four-round programme or overwriting stable IDs.
export const handler = (event: FunctionEvent) => withAdminSupabase(event, 'POST', async () => badRequest('The old 2026 template has been replaced by the complete confirmed five-session configuration. Use Tour → Competitions & scoring and Plan. Do not recreate rounds or betting pools.'));
