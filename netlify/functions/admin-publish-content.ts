import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type PublishScope = 'round_matches' | 'tour_all';
type PublicationResult = { teamCount: number; roundCount: number; matchCount: number };

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const roundId = optionalString(body.roundId);
  const scope = optionalString(body.scope) as PublishScope | null;
  if (!tourId) return badRequest('Tour ID is required.');
  if (!scope || !['round_matches', 'tour_all'].includes(scope)) return badRequest('Publication scope is invalid.');
  if (scope === 'round_matches' && !roundId) return badRequest('Round ID is required.');

  const result = await runSingle<PublicationResult>(
    supabase.rpc('admin_publish_tour_content', {
      p_tour_id: tourId,
      p_scope: scope,
      p_round_id: roundId,
    }),
    'publish tour content atomically',
  );
  await writeAuditLog(supabase, session, scope === 'tour_all' ? 'tour.content_published' : 'round.matches_published', scope === 'tour_all' ? 'tour' : 'round', scope === 'tour_all' ? tourId : roundId, { tourId, roundId, ...result });

  return jsonResponse(200, { ok: true, result });
});
