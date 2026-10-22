import type { Bet, BetMarket, BetOption, CourseGuide, Player, Tour, TourPlayer, TourTeam, TourTeamMember } from './types';

export type HoleScore = { hole: number; subjectId: string; status: 'gross' | 'pickup' | 'no_score' | 'unentered'; gross?: number };
export type CompetitionEntry = { id: string; playerIds: string[]; teamId?: string; label?: string };
export type PlayingGroup = { id: string; number: number; time?: string; entryIds: string[]; matchIds?: string[] };
export type HandicapSettings = {
  method: 'manual_session' | 'index_rating' | 'weighted_scramble' | 'scratch' | '';
  confirmed: boolean;
  allowancePercent?: number;
  slope?: number;
  courseRating?: number;
  lowerWeight?: number;
  higherWeight?: number;
};
export type HandicapInput = { subjectId: string; playingHandicap?: number; handicapIndex?: number; basisHoles?: number };
export type SessionTotal = { entryId: string; stableford: number; completedHoles: number };
export type GolfSession = {
  id: string; key: string; title: string; roundId: string; date: string;
  firstStart: string; endTime?: string; timezone: string; teeInterval?: number; startType?: 'tee_times' | 'shotgun';
  resultMode?: 'holes' | 'totals'; totals?: SessionTotal[];
  format: 'better_ball' | 'scramble' | 'individual'; holes: number | null;
  courseId?: string; courseName?: string; teeKey?: string; teeRequired?: boolean; holeOrder: number[];
  customHoles?: Array<{ number: number; par: number; strokeIndex?: number }>;
  handicapSettings: HandicapSettings; handicaps: HandicapInput[]; scores: HoleScore[];
  groups: PlayingGroup[]; draftGroups?: PlayingGroup[]; groupsPublished: boolean; orderBasis?: string; savedOrderBasis?: string;
};
export type RankingDecision = { scope: string; entryIds: string[]; reason: string; basis: string };
export type GolfCompetition = {
  id: string; key: string; title: string; entryKind: 'pair' | 'individual';
  pointAwards: number[]; entriesPublished: boolean; published: boolean; finalised: boolean; finalisedBasis?: string;
  entries: CompetitionEntry[]; sessions: GolfSession[]; decisions: RankingDecision[];
};
export type Room = { id: string; name: string; capacity: number; occupants: Array<{ playerId?: string; label?: string }> };
export type Accommodation = { id: string; name: string; kind: 'house' | 'apartment' | 'hotel'; rooms: Room[] };
export type TourOperations = { schemaVersion: 1; competitions: GolfCompetition[]; accommodation: Accommodation[]; issues: string[]; manualPoolWinners?: Record<string, { entryId: string; reason: string; basis: string; confirmedAt?: string }>; poolResults?: Record<string, { ready: boolean; optionId?: string; explanation: string; basis: string }> };
export type OpsBundle = {
  tour: Tour; state: TourOperations; version: number; players: Player[]; tourPlayers: TourPlayer[];
  teams: TourTeam[]; members: TourTeamMember[]; courses: CourseGuide[];
  markets: BetMarket[]; options: BetOption[]; bets: Bet[];
  defaultChecks?: Array<Record<string, unknown>>; scheduler?: Array<Record<string, unknown>>;
};
export const emptyOperations = (): TourOperations => ({ schemaVersion: 1, competitions: [], accommodation: [], issues: [] });
export const combinedAwards2026 = [6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
export const poolRules2026 = [
  { key: 'friday', title: 'Friday Faldo nine', competition: 'combined', session: 'friday', minimum: 500, cutoff: '2026-11-06T14:20:00Z' },
  { key: 'par3', title: 'Friday Par 3', competition: 'par3', session: 'par3', minimum: 1000, cutoff: '2026-11-06T19:30:00Z' },
  { key: 'saturday', title: 'Saturday Faldo', competition: 'saturday', session: 'saturday', minimum: 1000, cutoff: '2026-11-07T10:00:00Z' },
  { key: 'sunday', title: 'Sunday Old Course', competition: 'sunday', session: 'sunday', minimum: 1000, cutoff: '2026-11-08T11:24:00Z' },
  { key: 'monday', title: 'Monday nine', competition: 'combined', session: 'monday', minimum: 500, cutoff: '2026-11-09T10:00:00Z' },
  { key: 'combined', title: 'Friday and Monday combined', competition: 'combined', session: null, minimum: 500, cutoff: '2026-11-09T10:00:00Z' },
];

export function entryLabel(entry: CompetitionEntry, players: Player[]) {
  return entry.label || entry.playerIds.map((id) => players.find((p) => p.id === id)?.displayName || 'Player missing').join(' & ');
}
export function sessionHoles(session: GolfSession, courses: CourseGuide[]) {
  const course = courses.find((c) => c.id === session.courseId);
  const holes = session.customHoles ?? course?.holes ?? [];
  return session.holeOrder.map((number) => holes.find((h) => h.number === number));
}
function rounded(value: number) { return Math.sign(value) * Math.floor(Math.abs(value) + 0.5); }
export function playingHandicap(session: GolfSession, entry: CompetitionEntry, subjectId: string, courses: CourseGuide[]): number | undefined {
  const settings = session.handicapSettings;
  if (!settings.confirmed || !session.holes || !settings.method) return undefined;
  if (settings.method === 'scratch') return 0;
  const input = session.handicaps.find((h) => h.subjectId === subjectId);
  if (settings.method === 'manual_session') {
    return input?.basisHoles === session.holes && Number.isInteger(input.playingHandicap) ? input.playingHandicap : undefined;
  }
  const holes = sessionHoles(session, courses);
  if (holes.length !== session.holes || holes.some((h) => !h)) return undefined;
  if (settings.slope === undefined || settings.courseRating === undefined || settings.allowancePercent === undefined) return undefined;
  let index = input?.handicapIndex;
  let weightedCourseHandicap: number | undefined;
  const par = holes.reduce((sum, h) => sum + (h?.par ?? 0), 0);
  if (settings.method === 'weighted_scramble') {
    const indexes = entry.playerIds.map((id) => session.handicaps.find((h) => h.subjectId === id)?.handicapIndex);
    if (indexes.some((v) => v === undefined) || settings.lowerWeight === undefined || settings.higherWeight === undefined) return undefined;
    const sorted = (indexes as number[]).sort((a, b) => a - b);
    weightedCourseHandicap = sorted.reduce((sum, hi, i) => sum + (hi * session.holes! / 18 * settings.slope! / 113 + settings.courseRating! - par) * (i === 0 ? settings.lowerWeight! : settings.higherWeight!) / 100, 0);
    index = 0;
  }
  if (index === undefined) return undefined;
  // Rating and par belong to the actual played session. Scale the index once
  // for a nine; never allocate an eighteen-hole handicap on both nines.
  return rounded((weightedCourseHandicap ?? (index * session.holes / 18 * settings.slope / 113 + settings.courseRating - par)) * settings.allowancePercent / 100);
}
export function sessionConfigurationIssues(session: GolfSession, courses: CourseGuide[]) {
  if (session.resultMode === 'totals') return session.holes ? [] : ['Confirm the number of played holes.'];
  const issues: string[] = [];
  if (!session.holes) issues.push('Confirm the number of holes.');
  if (session.teeRequired !== false && !session.teeKey) issues.push('Confirm the tees.');
  const holes = sessionHoles(session, courses);
  if (!session.holes || session.holeOrder.length !== session.holes || new Set(session.holeOrder).size !== session.holes || holes.some((h) => !h || !Number.isInteger(h.par) || h.par < 1 || (session.handicapSettings.method !== 'scratch' && (!Number.isInteger(h.strokeIndex) || (h.strokeIndex ?? 0) < 1)))) issues.push('Confirm the actual hole order, pars and stroke indexes.');
  if (session.handicapSettings.method !== 'scratch' && new Set(holes.map((h) => h?.strokeIndex)).size !== holes.length) issues.push('Stroke indexes must be distinct within the played session.');
  if (!session.handicapSettings.confirmed || !session.handicapSettings.method) issues.push('Confirm the agreed handicap method for this session.');
  if (session.format === 'scramble' && session.handicapSettings.method === 'index_rating') issues.push('Use an agreed pair scramble handicap, not the individual formula.');
  if (session.format !== 'scramble' && session.handicapSettings.method === 'weighted_scramble') issues.push('Scramble weights do not apply to individual balls.');
  return issues;
}
export type SessionStanding = { total: number; complete: number; started: boolean; points: Array<number | null>; missingHandicaps: string[] };
export function sessionStanding(session: GolfSession, entry: CompetitionEntry, courses: CourseGuide[]): SessionStanding {
  if (session.resultMode === 'totals') {
    const result = session.totals?.find((r) => r.entryId === entry.id);
    return { total: result?.stableford ?? 0, complete: result?.completedHoles ?? 0, started: !!result, points: [], missingHandicaps: [] };
  }
  const holes = sessionHoles(session, courses);
  const subjects = session.format === 'scramble' ? [entry.id] : entry.playerIds;
  const handicaps = subjects.map((id) => playingHandicap(session, entry, id, courses));
  const missingHandicaps = subjects.filter((_, i) => handicaps[i] === undefined);
  const configured = sessionConfigurationIssues(session, courses).length === 0 && missingHandicaps.length === 0;
  const ranks = [...holes].filter((h) => h).sort((a, b) => (a!.strokeIndex ?? 0) - (b!.strokeIndex ?? 0)).map((h) => h!.number);
  let complete = 0;
  const points = session.holeOrder.map((number, holeIndex) => {
    const cards = subjects.map((subjectId) => session.scores.find((s) => s.hole === number && s.subjectId === subjectId));
    const entered = cards.every((s) => s && s.status !== 'unentered');
    if (!configured || !entered) return null;
    complete++;
    return Math.max(...cards.map((score, i) => {
      if (score!.status !== 'gross') return 0;
      const ph = handicaps[i]!;
      const count = session.holes!;
      const strokes = Math.floor(ph / count) + (ranks.indexOf(number) < ((ph % count) + count) % count ? 1 : 0);
      return Math.max(0, 2 + holes[holeIndex]!.par + strokes - score!.gross!);
    }));
  });
  return { total: points.reduce<number>((sum, p) => sum + (p ?? 0), 0), complete, started: session.scores.some((s) => subjects.includes(s.subjectId) && s.status !== 'unentered'), points, missingHandicaps };
}
export function rankingBasis(competition: GolfCompetition, scope: string) {
  const sessions = scope === 'combined' ? competition.sessions : competition.sessions.filter((s) => s.key === scope);
  return JSON.stringify({ entries: competition.entries, sessions: sessions.map(({ groups: _g, groupsPublished: _p, orderBasis: _b, savedOrderBasis: _s, draftGroups: _d, ...s }) => s) });
}
export type CompetitionStanding = {
  entry: CompetitionEntry; sessions: Record<string, SessionStanding>; total: number;
  rank?: number; explanation: string; points?: number; confirmed: boolean; complete: boolean;
};
export function competitionStandings(competition: GolfCompetition, courses: CourseGuide[], scope = 'combined', tieBreak: 'countback' | 'decision' = 'countback'): CompetitionStanding[] {
  const sessions = scope === 'combined' ? competition.sessions : competition.sessions.filter((s) => s.key === scope);
  const rows = competition.entries.map((entry) => {
    const values = Object.fromEntries(sessions.map((s) => [s.key, sessionStanding(s, entry, courses)]));
    return { entry, sessions: values, total: Object.values(values).reduce((sum, s) => sum + s.total, 0), rank: undefined as number | undefined, explanation: '', points: undefined as number | undefined, confirmed: false, complete: sessions.length > 0 && sessions.every((s) => s.holes && values[s.key].complete === s.holes) };
  });
  const allComplete = rows.length > 0 && rows.every((r) => r.complete);
  const fridayOnly = scope === 'combined' && sessions.length === 2 && rows.every((r) => r.sessions.friday?.complete === 9 && !r.sessions.monday?.started);
  const effectiveScope = fridayOnly ? 'friday' : scope;
  const keyFor = (row: CompetitionStanding): number[] => {
    if (tieBreak === 'decision') return [row.total];
    const cb = (key: string) => { const s = row.sessions[key]; const points = s?.points ?? []; return [s?.total ?? 0, ...[6, 3, 1].map((n) => points.slice(-n).reduce<number>((sum, p) => sum + (p ?? 0), 0))]; };
    if (effectiveScope === 'combined' && sessions.length === 2) return sessions.some((s) => s.resultMode === 'totals') ? [row.total, row.sessions.monday?.total ?? 0] : [row.total, ...cb('monday'), ...cb('friday')];
    return [row.total, ...cb(sessions[0]?.key ?? '').slice(1)];
  };
  const labels = effectiveScope === 'combined' && sessions.length === 2
    ? ['Combined total', 'Monday nine', 'Monday last six', 'Monday last three', 'Monday final hole', 'Friday nine', 'Friday last six', 'Friday last three', 'Friday final hole']
    : ['Total', 'Last six', 'Last three', 'Final hole'];
  const decision = competition.decisions.find((d) => d.scope === effectiveScope && d.basis === rankingBasis(competition, effectiveScope));
  const compare = (a: CompetitionStanding, b: CompetitionStanding) => {
    const ak = keyFor(a), bk = keyFor(b);
    for (let i = 0; i < ak.length; i++) if (ak[i] !== bk[i]) return bk[i] - ak[i];
    if (decision) {
      const ai = decision.entryIds.indexOf(a.entry.id), bi = decision.entryIds.indexOf(b.entry.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
    }
    return 0; // No alphabetical fallback: unresolved ties remain unresolved.
  };
  rows.sort(compare);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!allComplete && !fridayOnly) { row.explanation = 'Provisional - scorecards incomplete'; continue; }
    const unresolved = rows.some((other) => other !== row && compare(row, other) === 0);
    if (unresolved) { row.explanation = 'Still tied - recorded admin ranking required'; continue; }
    row.rank = i + 1;
    const neighbour = (rows[i - 1]?.total === row.total ? rows[i - 1] : undefined) ?? (rows[i + 1]?.total === row.total ? rows[i + 1] : undefined) ?? rows[i - 1] ?? rows[i + 1];
    let deciding = 'Total';
    if (neighbour) {
      const a = keyFor(row), b = keyFor(neighbour);
      const index = a.findIndex((v, n) => v !== b[n]);
      deciding = index >= 0 ? labels[index] + ': ' + a[index] + ' vs ' + b[index] : 'Admin decision: ' + decision?.reason;
    }
    row.explanation = deciding;
    row.points = competition.pointAwards[i];
    row.confirmed = scope === 'combined' && allComplete && competition.finalised && competition.finalisedBasis === rankingBasis(competition, 'combined');
  }
  return rows;
}
export function mondayOrderPreview(competition: GolfCompetition, courses: CourseGuide[]) {
  const rows = competitionStandings(competition, courses, 'friday');
  if (rows.length !== 12 || rows.some((r) => !r.complete || !r.rank)) throw new Error('Complete all Friday cards and resolve Friday countback ties before ordering Monday.');
  const monday = competition.sessions.find((s) => s.key === 'monday');
  if (!monday) throw new Error('Monday session is missing.');
  return Array.from({ length: 6 }, (_, index) => ({
    id: monday.groups[index]?.id ?? crypto.randomUUID(), number: index + 1,
    time: '10:' + String(index * 10).padStart(2, '0'), entryIds: rows.slice(index * 2, index * 2 + 2).map((r) => r.entry.id),
  }));
}
export function poolCommitment(market: BetMarket, playerId: string, bets: Bet[]) {
  const minimum = market.minimumStakePence ?? 1000;
  const staked = bets.filter((b) => b.marketId === market.id && b.bettorPlayerId === playerId && b.status === 'active' && b.outcomeStatus !== 'void').reduce((sum, b) => sum + (b.stakeAmountPence ?? 0), 0);
  return { minimum, staked, shortfall: Math.max(0, minimum - staked), complete: staked >= minimum };
}
export function accommodationIssues(state: TourOperations, rosterIds: string[]) {
  const ids = state.accommodation.flatMap((a) => a.rooms.flatMap((r) => r.occupants.map((o) => o.playerId).filter((id): id is string => Boolean(id))));
  return [
    ...state.accommodation.flatMap((a) => a.rooms.flatMap((r) => r.occupants.length > r.capacity ? [a.name + ' / ' + r.name + ' exceeds capacity.'] : [])),
    ...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => 'Duplicate room assignment: ' + id),
    ...rosterIds.filter((id) => !ids.includes(id)).map((id) => 'Unassigned tourist: ' + id),
    ...state.accommodation.flatMap((a) => a.rooms.flatMap((r) => r.occupants.filter((o) => !o.playerId).map((o) => 'Resolve room identity: ' + o.label))),
  ];
}


export function projectedCompetitionAwards(state: TourOperations, courses: CourseGuide[] = []) {
  return state.competitions.flatMap((c) => {
    if (!c.published || !c.entriesPublished || !c.pointAwards.length) return [];
    let rows = competitionStandings(c, courses);
    // Keep the clearly labelled Friday projection while Monday totals arrive.
    if (!rows.every((r) => r.complete) && !rows.some((r) => r.points !== undefined)) {
      const friday = competitionStandings(c, courses, 'friday');
      if (friday.length && friday.every((r) => r.complete)) rows = friday;
    }
    return rows.filter((r) => !r.confirmed && r.entry.teamId && r.points !== undefined).map((r) => ({ competitionId: c.id, teamId: r.entry.teamId!, points: r.points! }));
  });
}
