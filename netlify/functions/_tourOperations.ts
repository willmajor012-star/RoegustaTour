import type { SupabaseClient } from '@supabase/supabase-js';
import { runRows, runSingle } from './_adminSupabase';
import { mapBet, mapBetMarket, mapBetOption, mapCourseGuide, mapPlayer, mapTour, mapTourPlayer, mapTourTeam, mapTourTeamMember } from './_mappers';
import { competitionStandings, emptyOperations, entryLabel, mondayOrderPreview, rankingBasis, sessionConfigurationIssues, type GolfCompetition, type GolfSession, type OpsBundle, type PlayingGroup, type TourOperations } from '../../src/lib/tourOperations';
const randomUUID = () => crypto.randomUUID();

type Row = Record<string, unknown>;
export async function readOperations(db: SupabaseClient, tourId: string, admin = false): Promise<OpsBundle> {
  const [tour, ops, players, attendance, teams, members, courses, markets] = await Promise.all([
    runSingle<Row>(db.from('tours').select('*').eq('id', tourId).single(), 'tour'),
    runRows(db.from('tour_operations').select('*').eq('tour_id', tourId), 'competition setup'),
    runRows(db.from('players').select('*').order('display_name'), 'players'),
    runRows(db.from('tour_players').select('*').eq('tour_id', tourId), 'attendance'),
    runRows(db.from('tour_teams').select('*').eq('tour_id', tourId), 'sides'),
    runRows(db.from('tour_team_members').select('*').eq('tour_id', tourId), 'members'),
    runRows(db.from('tour_courses').select('*').eq('tour_id', tourId), 'courses'),
    runRows(db.from('bet_markets').select('*').eq('tour_id', tourId), 'pools'),
  ]);
  const ids = markets.map((m) => String(m.id));
  const [options, bets, checks, scheduler] = await Promise.all([
    ids.length ? runRows(db.from('bet_options').select('*').in('market_id', ids), 'selections') : [],
    ids.length && admin ? runRows(db.from('bets').select('*').in('market_id', ids), 'stakes') : [],
    ids.length && admin ? runRows(db.from('bet_pool_default_checks').select('*').in('market_id', ids), 'cutoff audit') : [],
    admin ? runRows(db.from('bet_pool_scheduler_runs').select('*').order('started_at', { ascending: false }).limit(5), 'scheduler') : [],
  ]);
  const state = (ops[0]?.state ?? emptyOperations()) as TourOperations;
  return { tour: mapTour(tour), state, version: Number(ops[0]?.version ?? 0), players: players.map(mapPlayer), tourPlayers: attendance.map(mapTourPlayer), teams: teams.map(mapTourTeam), members: members.map(mapTourTeamMember), courses: courses.map(mapCourseGuide), markets: markets.map(mapBetMarket), options: options.map(mapBetOption), bets: bets.map(mapBet), defaultChecks: checks, scheduler };
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function completeEntries(c: GolfCompetition, b: OpsBundle) {
  const roster = b.tourPlayers.filter((p) => p.attending).map((p) => p.playerId);
  const all = c.entries.flatMap((e) => e.playerIds);
  assert(all.length === roster.length && new Set(all).size === roster.length && roster.every((p) => all.includes(p)), 'Assign every attending golfer exactly once.');
  assert(c.entries.every((e) => e.playerIds.length === (c.entryKind === 'pair' ? 2 : 1)), 'Complete every competition entry.');
  if (c.key !== 'par3') for (const entry of c.entries) {
    const sides = entry.playerIds.map((p) => b.members.find((m) => m.playerId === p)?.teamId);
    assert(entry.teamId && sides.every((t) => t === entry.teamId), 'Set the main tour side membership in People, then select the matching side for each entry.');
  }
}
export function validateState(state: TourOperations, b: OpsBundle) {
  const roster = new Set(b.tourPlayers.filter((p) => p.attending).map((p) => p.playerId));
  const ids = new Set<string>();
  assert(Array.isArray(state.competitions) && Array.isArray(state.accommodation), 'Invalid tour state.');
  for (const c of state.competitions) {
    const people: string[] = [];
    for (const e of c.entries) {
      assert(/^[0-9a-f-]{36}$/i.test(e.id) && !ids.has(e.id), 'Competition identities must be unique UUIDs.'); ids.add(e.id);
      assert(e.playerIds.length <= (c.entryKind === 'pair' ? 2 : 1), 'Too many golfers in an entry.');
      assert(e.playerIds.every((p) => roster.has(p)), 'A competition golfer is not attending this tour.');
      people.push(...e.playerIds);
      assert(!e.teamId || b.teams.some((t) => t.id === e.teamId), 'Unknown main tour side.');
    }
    assert(new Set(people).size === people.length, 'A golfer appears more than once in this competition.');
    for (const s of c.sessions) {
      assert(s.timezone === b.tour.timezone, 'Session timezone must match the tour timezone.');
      const subjects = s.format === 'scramble' ? c.entries.map((e) => e.id) : people;
      const keys = new Set<string>();
      for (const score of s.scores) {
        const key = score.subjectId + ':' + score.hole;
        assert(subjects.includes(score.subjectId) && s.holeOrder.includes(score.hole) && !keys.has(key), 'Invalid or duplicated scorecard hole.'); keys.add(key);
        assert(['gross', 'pickup', 'no_score', 'unentered'].includes(score.status), 'Invalid score status.');
        assert(score.status !== 'gross' || (Number.isInteger(score.gross) && score.gross! >= 1 && score.gross! <= 99), 'Gross scores must be whole numbers from 1 to 99.');
      }
      assert(s.holes === null || (Number.isInteger(s.holes) && s.holes > 0 && s.holes <= 36), 'Confirm a valid session hole count.');
      for (const value of [s.handicapSettings.allowancePercent, s.handicapSettings.lowerWeight, s.handicapSettings.higherWeight]) assert(value === undefined || (Number.isFinite(value) && value >= 0 && value <= 100), 'Handicap percentages must be between 0 and 100.');
      assert(s.handicapSettings.slope === undefined || (s.handicapSettings.slope >= 55 && s.handicapSettings.slope <= 155), 'Slope must be between 55 and 155.');
      assert(s.handicapSettings.courseRating === undefined || (Number.isFinite(s.handicapSettings.courseRating) && s.handicapSettings.courseRating > 0), 'Invalid session course rating.');
      for (const h of s.handicaps) assert((h.playingHandicap === undefined || (Number.isInteger(h.playingHandicap) && Math.abs(h.playingHandicap) <= 99)) && (h.handicapIndex === undefined || (Number.isFinite(h.handicapIndex) && h.handicapIndex >= -10 && h.handicapIndex <= 54)), 'Invalid handicap.');
      assert(c.key !== 'par3' || s.handicapSettings.method === 'scratch', 'The separate Par 3 competition must use scratch Stableford.');
      if (s.handicapSettings.method === 'scratch' && b.tour.rulesVersion === 'confirmed-2026') assert(c.key === 'par3', 'Only the separate Par 3 competition is confirmed as scratch. Use the agreed Monday handicap.');
    }
  }
  for (const unit of state.accommodation) {
    assert(unit.name.trim() && ['house', 'apartment', 'hotel'].includes(unit.kind), 'Name the accommodation and choose its type.');
    for (const room of unit.rooms) {
      assert(room.name.trim() && Number.isInteger(room.capacity) && room.capacity > 0, 'Rooms need a name and positive whole-number capacity.');
      assert(room.occupants.length <= room.capacity, 'Room capacity exceeded.');
      assert(room.occupants.every((o) => !o.playerId || roster.has(o.playerId)), 'Room occupants must be on this tour roster.');
    }
  }
  const occupants = state.accommodation.flatMap((u) => u.rooms.flatMap((r) => r.occupants.flatMap((o) => o.playerId ? [o.playerId] : [])));
  assert(new Set(occupants).size === occupants.length, 'A golfer is assigned to more than one room. Move them out of their current room first.');
}
function validateGroups(c: GolfCompetition, groups: PlayingGroup[], b: OpsBundle) {
  completeEntries(c, b);
  const ids = groups.flatMap((g) => g.entryIds);
  assert(groups.length === 6 && groups.every((g) => g.entryIds.length === (c.entryKind === 'pair' ? 2 : 4)), 'Use six groups of four golfers.');
  assert(ids.length === c.entries.length && new Set(ids).size === ids.length && c.entries.every((e) => ids.includes(e.id)), 'Each competition entry must appear in exactly one group.');
}
export async function applyOperationsAction(db: SupabaseClient, b: OpsBundle, action: string, payload: Row, version: number, actor: string) {
  assert(version === b.version, 'Another organiser updated this tour. Reload before applying your changes.');
  const state = structuredClone(b.state);
  const c = state.competitions.find((x) => x.id === payload.competitionId);
  const s = c?.sessions.find((x) => x.id === payload.sessionId);
  const matches: Row[] = [];
  if (action === 'save_rooms') state.accommodation = payload.accommodation as TourOperations['accommodation'];
  else {
    assert(c, 'Competition not found.');
    if (action === 'save_entries') {
      const entries = payload.entries as GolfCompetition['entries'];
      assert(entries.length === c.entries.length && entries.every((e) => c.entries.some((old) => old.id === e.id)), 'Preserve the stable competition entry identities.');
      const oldPlayers = JSON.stringify(c.entries.map((e) => [e.id, e.playerIds]));
      const changed = oldPlayers !== JSON.stringify(entries.map((e) => [e.id, e.playerIds]));
      const compMarkets = b.markets.filter((m) => m.competitionKey === c.key).map((m) => m.id);
      if (changed) assert(!c.sessions.some((x) => x.scores.some((v) => v.status !== 'unentered')) && !b.bets.some((v) => compMarkets.includes(v.marketId)), 'Pairs with saved scores or placed bets cannot be redrawn. Preserve their identities and correct individual records explicitly.');
      assert(!changed || !c.entriesPublished || payload.confirmRedraw === true, 'This draw is already published. Confirm a replacement draw explicitly.');
      c.entries = entries;
      if (c.key === 'par3') for (const session of c.sessions) session.draftGroups = Array.from({ length: 6 }, (_, i) => ({ id: session.groups[i]?.id ?? randomUUID(), number: i + 1, entryIds: entries.slice(i * 2, i * 2 + 2).map((e) => e.id) }));
      if (changed) c.entriesPublished = false;
    } else if (action === 'publish_entries') { completeEntries(c, b); c.entriesPublished = true;
      if (c.key === 'par3') for (const session of c.sessions) { assert(session.draftGroups, 'Save the draw preview first.'); validateGroups(c, session.draftGroups, b); session.groups = session.draftGroups; session.groupsPublished = true; }
    }
    else if (action === 'save_session') {
      assert(s, 'Session not found.');
      const update = payload.settings as GolfSession;
      // Programme fields and saved cards cannot be overwritten by a settings form.
      Object.assign(s, { courseId: update.courseId, teeKey: update.teeKey, holeOrder: update.holeOrder, customHoles: update.customHoles, handicaps: update.handicaps, handicapSettings: update.handicapSettings });
      if (c.key === 'par3') s.holes = update.holes;
      s.courseName = b.courses.find((course) => course.id === s.courseId)?.name ?? s.courseName;
      if (s.handicapSettings.confirmed) {
        const issues = sessionConfigurationIssues(s, b.courses);
        assert(!issues.length, issues.join(' '));
        // Snapshot the actual scorecard so a later course-guide edit cannot alter saved results.
        if (!s.customHoles) s.customHoles = b.courses.find((course) => course.id === s.courseId)?.holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex }));
      }
    } else if (action === 'save_scores') {
      assert(s, 'Session not found.');
      const incoming = payload.scores as GolfSession['scores'];
      assert(Array.isArray(incoming), 'Scorecards are required.');
      for (const score of incoming) { const index = s.scores.findIndex((v) => v.hole === score.hole && v.subjectId === score.subjectId); if (index >= 0) s.scores[index] = score; else s.scores.push(score); }
      // A correction invalidates confirmed awards. It never silently republishes Monday's order.
      c.finalised = false;
    } else if (action === 'ranking_decision') {
      const scope = String(payload.scope); const reason = String(payload.reason ?? '').trim(); const entryIds = payload.entryIds as string[];
      assert(reason && entryIds.length === c.entries.length && new Set(entryIds).size === entryIds.length && c.entries.every((e) => entryIds.includes(e.id)), 'Record the full order and the reason for this decision.');
      const baseScope = scope.replace(/^bet:/, '');
      c.decisions = c.decisions.filter((d) => d.scope !== scope);
      c.decisions.push({ scope, reason, entryIds, basis: rankingBasis(c, baseScope) }); c.finalised = false;
    } else if (action === 'save_monday_order') {
      assert(c.key === 'combined', 'Choose the combined competition.');
      const mon = c.sessions.find((v) => v.key === 'monday')!;
      mon.draftGroups = mondayOrderPreview(c, b.courses); mon.savedOrderBasis = rankingBasis(c, 'friday');
    } else if (action === 'save_groups') {
      assert(s && s.key !== 'monday', 'Monday groups must be generated from the complete Friday results.');
      const groups = payload.groups as PlayingGroup[]; validateGroups(c, groups, b);
      s.draftGroups = groups;
    } else if (action === 'publish_groups') {
      assert(s?.draftGroups, 'Save a preview before publishing.'); validateGroups(c, s.draftGroups, b);
      if (s.key === 'monday') assert(s.savedOrderBasis === rankingBasis(c, 'friday'), 'Friday scores changed. Preview and save the revised Monday order first.');
      s.groups = s.draftGroups; s.groupsPublished = true; s.orderBasis = s.savedOrderBasis;
      for (const g of s.groups) {
        if (s.teeInterval !== undefined) { const [h, m] = s.firstStart.split(':').map(Number); const minutes = h * 60 + m + (g.number - 1) * s.teeInterval; g.time = String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'); }
        else g.time = g.number === 1 ? s.firstStart : undefined;
        if (['saturday', 'sunday'].includes(c.key)) {
          g.matchIds ??= Array.from({ length: c.entryKind === 'pair' ? 1 : 2 }, randomUUID);
          for (let i = 0; i < g.matchIds.length; i++) {
            const a = c.entries.find((e) => e.id === g.entryIds[i * 2])!, z = c.entries.find((e) => e.id === g.entryIds[i * 2 + 1])!;
            assert(a.teamId && z.teamId && a.teamId !== z.teamId, 'Match opponents must belong to opposing main tour sides.');
            matches.push({ id: g.matchIds[i], roundId: s.roundId, number: (g.number - 1) * g.matchIds.length + i + 1, format: c.entryKind === 'pair' ? 'better_ball' : 'singles', teamA: a.teamId, teamB: z.teamId, labelA: entryLabel(a, b.players), labelB: entryLabel(z, b.players), playersA: a.playerIds, playersB: z.playerIds, time: g.time });
          }
        }
      }
    } else if (action === 'finalise') {
      completeEntries(c, b); assert(c.entriesPublished, 'Publish the confirmed competition entries first.');
      const rows = competitionStandings(c, b.courses);
      assert(rows.length > 0 && rows.every((r) => r.complete && r.rank), 'Complete every session and resolve all countback ties before finalising.');
      assert(!c.pointAwards.length || (c.key === 'combined' && rows.length === 12 && c.pointAwards.reduce((a, v) => a + v, 0) === 39), 'Invalid combined point allocation.');
      c.finalised = true; c.finalisedBasis = rankingBasis(c, 'combined');
    } else throw new Error('Unknown tour operation.');
  }
  validateState(state, b);
  const awards = state.competitions.flatMap((comp) => competitionStandings(comp, b.courses).filter((r) => r.confirmed && r.points !== undefined).map((r) => ({ competitionId: comp.id, entryId: r.entry.id, teamId: r.entry.teamId, points: r.points, basis: comp.finalisedBasis })));
  const options: Row[] = [];
  for (const market of b.markets.filter((m) => m.poolKey)) {
    const comp = state.competitions.find((x) => x.key === market.competitionKey);
    if (!comp?.entriesPublished) continue;
    for (const [index, e] of comp.entries.entries()) {
      const old = b.options.find((o) => o.marketId === market.id && (o.linkedEntryId === e.id || (comp.entryKind === 'individual' && o.linkedPlayerId === e.playerIds[0])));
      options.push({ id: old?.id ?? randomUUID(), marketId: market.id, label: entryLabel(e, b.players), entryId: e.id, playerId: comp.entryKind === 'individual' ? e.playerIds[0] : null, sortOrder: index + 1 });
    }
  }
  const poolResults: Row = {};
  for (const m of b.markets.filter((v) => v.poolKey)) {
    const comp = state.competitions.find((v) => v.key === m.competitionKey);
    if (!comp) continue;
    const scope = m.sessionKey ?? 'combined';
    const independent = { ...comp, decisions: comp.decisions.filter((v) => v.scope === 'bet:' + scope).map((v) => ({ ...v, scope })) };
    // A competition countback is not an agreed betting tie rule. A tied
    // top total requires a separate recorded betting decision.
    const rows = competitionStandings(independent, b.courses, scope, 'decision');
    const complete = comp.entriesPublished && rows.length > 0 && rows.every((v) => v.complete);
    const top = rows[0];
    const winner = top?.rank === 1 ? options.find((o) => o.marketId === m.id && o.entryId === top.entry.id) : undefined;
    poolResults[m.id] = { ready: complete && !!winner, optionId: winner?.id, basis: rankingBasis(comp, scope), explanation: top?.explanation ?? 'No complete scorecards' };
  }
  const persist = { ...state, poolResults };
  const { error } = await db.rpc('commit_tour_operations', { p_tour_id: b.tour.id, p_version: version, p_state: persist, p_awards: awards, p_options: options, p_matches: matches, p_actor: actor, p_action: 'tour.' + action });
  if (error) throw new Error(error.message);
  return readOperations(db, b.tour.id, true);
}
