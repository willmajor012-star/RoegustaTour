import { withLiveData, getCurrentTour } from './_publicData';
import { readOperations } from './_tourOperations';
import type { PublicAccessEvent } from './_publicAccess';
export const handler = (event: PublicAccessEvent) => withLiveData(event, async (db) => {
  const tour = await getCurrentTour(db);
  if (!tour) return {};
  const bundle = await readOperations(db, tour.id);
  bundle.state.competitions = bundle.state.competitions.filter((c) => c.published).map((c) => ({ ...c, entries: c.entriesPublished ? c.entries : [], sessions: c.sessions.map((s) => ({ ...s, draftGroups: undefined, groups: s.groupsPublished ? s.groups : [] })) }));
  bundle.markets = bundle.markets.filter((m) => m.status !== 'draft');
  bundle.options = bundle.options.filter((o) => o.active !== false && bundle.markets.some((m) => m.id === o.marketId));
  bundle.courses = bundle.courses.filter((c) => c.published); bundle.teams = bundle.teams.filter((t) => t.published);
  return bundle;
});
