import type { CourseGuide, HistoricalPlayerStats, Match, MatchParticipant, Round, Tour, TourPlayer, TourTeam, TourTeamMember } from './types';
import { competitionStandings, sessionStanding, type CompetitionEntry, type GolfCompetition, type TourOperations } from './tourOperations';
import { derivePlayerMatchResultsFromMatch } from './scoring';

export type WinPrediction = {
  status: 'ready' | 'awaiting_teams' | 'unavailable';
  teamIds: string[]; percentages?: [number, number, number]; // left, draw, right
  basis?: 'teams' | 'draws' | 'results' | 'decided'; simulations?: number;
};
export type PredictionInput = {
  tour: Tour; teams: TourTeam[]; members: TourTeamMember[]; roster: TourPlayer[];
  rounds: Round[]; matches: Match[]; participants: MatchParticipant[];
  history: Match[]; historyParticipants: MatchParticipant[]; historicalStats: HistoricalPlayerStats[];
  tourYears: Record<string, number>; state: TourOperations; courses: CourseGuide[];
  awards: Array<{ competitionId: string; teamId: string; points: number }>;
};
type Evidence = { won: number; played: number; singlesWon: number; singlesPlayed: number; pairsWon: number; pairsPlayed: number };
const blank = (): Evidence => ({ won: 0, played: 0, singlesWon: 0, singlesPlayed: 0, pairsWon: 0, pairsPlayed: 0 });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const logistic = (v: number) => 1 / (1 + Math.exp(-v));
const logit = (p: number) => Math.log(p / (1 - p));

// Six neutral match-equivalents keep a single win and newcomers conservative.
// Format-specific evidence borrows six observations from the overall estimate.
export function playerPointEstimate(e: Evidence, format?: 'singles' | 'pairs') {
  const overall = (e.won + 3) / (e.played + 6);
  const played = format === 'singles' ? e.singlesPlayed : format === 'pairs' ? e.pairsPlayed : 0;
  const won = format === 'singles' ? e.singlesWon : format === 'pairs' ? e.pairsWon : 0;
  const p = format ? (won + 6 * overall) / (played + 6) : overall;
  const n = format ? played + 6 : e.played + 6;
  return { p, sd: Math.sqrt(p * (1 - p) / (n + 1)) };
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(value: string) { let n = 2166136261; for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function shuffled<T>(xs: T[], random: () => number) {
  const result = [...xs]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result;
}

export function predictTourWin(input: PredictionInput, simulations = 20000): WinPrediction {
  const teams = [...input.teams].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const teamIds = teams.map((t) => t.id);
  const unavailable: WinPrediction = { status: 'unavailable', teamIds };
  if (input.tour.rulesVersion !== 'confirmed-2026' || teams.length !== 2) return unavailable;
  const roster = input.roster.filter((p) => p.attending).map((p) => p.playerId).sort();
  const members = input.members.filter((m) => roster.includes(m.playerId) && teamIds.includes(m.teamId));
  const squads = teamIds.map((id) => members.filter((m) => m.teamId === id).map((m) => m.playerId).sort());
  if (roster.length !== 24 || new Set(roster).size !== 24 || members.length !== 24 || new Set(members.map((m) => m.playerId)).size !== 24 || squads.some((s) => s.length !== 12)) return { status: 'awaiting_teams', teamIds };
  const combined = input.state.competitions.find((c) => c.key === 'combined' && c.published);
  if (!combined || combined.pointAwards.length !== 12 || combined.pointAwards.reduce((a, b) => a + b, 0) !== 39 || combined.sessions.length !== 2) return unavailable;
  const side = new Map(members.map((m) => [m.playerId, m.teamId]));
  const usableDraw = (c?: GolfCompetition) => !!c?.entriesPublished && c.entries.length === (c.entryKind === 'pair' ? 12 : 24)
    && c.entries.every((e) => e.playerIds.length === (c.entryKind === 'pair' ? 2 : 1) && e.playerIds.every((id) => side.get(id) === e.teamId))
    && new Set(c.entries.flatMap((e) => e.playerIds)).size === 24;
  const paired = usableDraw(combined);
  const current = [...new Map(input.matches.map((m) => [m.id, m])).values()].sort((a, b) => a.id.localeCompare(b.id)).filter((m) => m.status !== 'draft' && m.status !== 'void' && m.published !== false && input.rounds.some((r) => r.id === m.roundId && !['fun', 'contributing'].includes(r.competitionRole ?? '')));
  const locked: [number, number] = [0, 0];
  for (const m of current.filter((m) => m.status === 'complete')) {
    if (!Number.isFinite(m.pointsSideA) || !Number.isFinite(m.pointsSideB) || Math.abs(m.pointsSideA! + m.pointsSideB! - m.pointsAvailable) > .001) return unavailable;
    for (const [id, points] of [[m.sideATeamId, m.pointsSideA!], [m.sideBTeamId, m.pointsSideB!]] as const) {
      const index = teamIds.indexOf(id); if (index < 0) return unavailable; locked[index] += points;
    }
  }
  const awards = input.awards.filter((a) => a.competitionId === combined.id);
  const combinedLocked = awards.length > 0;
  if (combinedLocked) {
    if (Math.abs(awards.reduce((s, a) => s + a.points, 0) - 39) > .001 || awards.some((a) => !teamIds.includes(a.teamId))) return unavailable;
    awards.forEach((a) => { locked[teamIds.indexOf(a.teamId)] += a.points; });
  }
  if (locked.some((v) => v < 0) || locked[0] + locked[1] > 57) return unavailable;
  if (locked[0] > 28.5) return { status: 'ready', teamIds, percentages: [100, 0, 0], basis: 'decided' };
  if (locked[1] > 28.5) return { status: 'ready', teamIds, percentages: [0, 0, 100], basis: 'decided' };
  if (locked[0] + locked[1] === 57) return { status: 'ready', teamIds, percentages: [0, 100, 0], basis: 'decided' };

  const evidence = new Map(roster.map((id) => [id, blank()]));
  const history = [...new Map(input.history.filter((m) => m.tourId !== input.tour.id).map((m) => [m.id, m])).values()].sort((a, b) => a.id.localeCompare(b.id));
  let draws = 0, played = 0;
  for (const m of [...history, ...current]) {
    const ps = (m.tourId === input.tour.id ? input.participants : input.historyParticipants).filter((p) => p.matchId === m.id);
    const age = Math.max(0, input.tour.year - (input.tourYears[m.tourId] ?? input.tour.year));
    const weight = Math.pow(.85, age); // modest recency decay; current match result counted once
    const results = derivePlayerMatchResultsFromMatch(m, ps);
    if (results.length && m.status === 'complete') { played += weight; if (m.winningSide === 'halved') draws += weight; }
    for (const r of results) {
      const e = evidence.get(r.playerId); if (!e || r.result === 'void') continue;
      const points = r.result === 'win' ? 1 : r.result === 'draw' ? .5 : 0;
      // A pair's shared result is half an independent observation per golfer.
      const w = weight * (m.format === 'singles' ? 1 : .5);
      e.played += w; e.won += w * points;
      if (m.format === 'singles') { e.singlesPlayed += w; e.singlesWon += w * points; }
      else { e.pairsPlayed += w; e.pairsWon += w * points; }
    }
  }
  // Imported aggregate records only fill editions not already represented by matches.
  for (const r of input.historicalStats) {
    if (r.tourId === input.tour.id || (r.tourId && history.some((m) => m.tourId === r.tourId && input.historyParticipants.some((p) => p.matchId === m.id && p.playerId === r.playerId)))) continue;
    if (!r.tourId && history.some((m) => input.historyParticipants.some((p) => p.matchId === m.id && p.playerId === r.playerId))) continue;
    const e = evidence.get(r.playerId); if (!e) continue;
    const weight = Math.pow(.85, Math.max(0, input.tour.year - (input.tourYears[r.tourId ?? ''] ?? input.tour.year)));
    e.played += (r.wins + r.draws + r.losses) * weight; e.won += (r.wins + r.draws * .5) * weight;
  }
  const standings = paired ? competitionStandings(combined, input.courses) : [];
  const fixedRank = paired && standings.every((r) => r.complete && r.rank !== undefined);
  const friday = combined.sessions.find((s) => s.key === 'friday');
  const observedFriday = paired && friday ? combined.entries.map((e) => ({ e, s: sessionStanding(friday, e, input.courses) })).filter((v) => v.s.complete > 0) : [];
  const fieldFriday = mean(observedFriday.map((v) => v.s.total / v.s.complete));
  const form = new Map<string, number>();
  observedFriday.forEach(({ e, s }) => e.playerIds.forEach((id) => form.set(id, clamp((s.total / s.complete - fieldFriday) * .35 * s.complete / 9, -.5, .5))));
  const estimateByPlayer = new Map(roster.map((id) => [id, { singles: playerPointEstimate(evidence.get(id)!, 'singles'), pairs: playerPointEstimate(evidence.get(id)!, 'pairs') }]));
  const halfChance = clamp((draws + 4) / (played + 40), .05, .2);
  // Seed from relevant inputs only: no wall clock, room edits, or page refresh jitter.
  const seed = hash(JSON.stringify({ roster, squads, evidence: [...evidence], current, participants: [...input.participants].sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerId.localeCompare(b.playerId)),
    combined: { entries: paired ? combined.entries : [], sessions: combined.sessions.map((s) => ({ key: s.key, holes: s.holes, totals: paired ? s.totals : [], scores: paired ? s.scores : [] })), decisions: paired ? combined.decisions : [] }, awards }));
  const random = randomSource(seed);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
  const syntheticPairs = (size: number, excluded = new Set<string>()): CompetitionEntry[] => squads.flatMap((s, i) => {
    const players = shuffled(s.filter((id) => !excluded.has(id)), random);
    return Array.from({ length: Math.floor(players.length / size) }, (_, n) => ({ id: `forecast-${i}-${n}`, teamId: teamIds[i], playerIds: players.slice(n * size, (n + 1) * size) }));
  });
  const plans = ['saturday', 'sunday'].map((key) => {
    const c = input.state.competitions.find((c) => c.key === key);
    const roundId = c?.sessions[0]?.roundId;
    const matches = current.filter((m) => m.roundId === roundId);
    const size = key === 'saturday' ? 2 : 1;
    return { c, matches, size, count: key === 'saturday' ? 6 : 12 };
  });
  if (plans.some((p) => !p.c || p.matches.length > p.count || p.matches.some((m) => m.pointsAvailable !== 1 || m.sideATeamId === m.sideBTeamId || !teamIds.includes(m.sideATeamId) || !teamIds.includes(m.sideBTeamId)))) return unavailable;
  // An incomplete/corrupt published match must not silently consume the wrong
  // players in the remaining draw. Keep the main score card usable without it.
  for (const plan of plans) {
    const used = new Set<string>();
    for (const m of plan.matches) {
      const ps = input.participants.filter((p) => p.matchId === m.id);
      if (ps.length !== plan.size * 2 || ['A', 'B'].some((s) => ps.filter((p) => p.side === s).length !== plan.size)) return unavailable;
      for (const p of ps) {
        if (used.has(p.playerId) || side.get(p.playerId) !== (p.side === 'A' ? m.sideATeamId : m.sideBTeamId)) return unavailable;
        used.add(p.playerId);
      }
    }
  }
  const wins = [0, 0, 0];
  const count = Math.max(1000, Math.floor(simulations));
  for (let iteration = 0; iteration < count; iteration++) {
    const score = [...locked];
    // Shared player uncertainty is sampled once per tour, not independently per point.
    const skill = new Map(roster.map((id) => {
      const estimates = estimateByPlayer.get(id)!; const z = normal();
      const value = (kind: 'singles' | 'pairs') => logit(clamp(estimates[kind].p + z * estimates[kind].sd, .08, .92)) + (form.get(id) ?? 0) + normal() * .2;
      return [id, { singles: value('singles'), pairs: value('pairs') }];
    }));
    const strength = (ids: string[], kind: 'singles' | 'pairs') => mean(ids.map((id) => skill.get(id)?.[kind] ?? 0));
    for (const plan of plans) {
      const occupied = new Set<string>();
      const matchups: Array<{ a: string[]; b: string[] }> = [];
      for (const m of plan.matches) {
        const ps = input.participants.filter((p) => p.matchId === m.id);
        ps.forEach((p) => occupied.add(p.playerId));
        if (m.status === 'complete') continue;
        const leftSide = m.sideATeamId === teamIds[0] ? 'A' : 'B';
        const a = ps.filter((p) => p.side === leftSide).map((p) => p.playerId);
        const b = ps.filter((p) => p.side !== leftSide).map((p) => p.playerId);
        matchups.push({ a, b });
      }
      const entries = usableDraw(plan.c) ? plan.c!.entries.filter((e) => e.playerIds.every((id) => !occupied.has(id))) : syntheticPairs(plan.size, occupied);
      const left = shuffled(entries.filter((e) => e.teamId === teamIds[0]), random);
      const right = shuffled(entries.filter((e) => e.teamId === teamIds[1]), random);
      const missing = plan.count - plan.matches.length;
      for (let n = 0; n < missing; n++) matchups.push({ a: left[n]?.playerIds ?? squads[0], b: right[n]?.playerIds ?? squads[1] });
      for (const m of matchups) {
        const kind = plan.size === 1 ? 'singles' : 'pairs'; const r = random();
        const p = logistic(.6 * (strength(m.a, kind) - strength(m.b, kind)));
        const points = r < halfChance ? .5 : (r - halfChance) / (1 - halfChance) < p ? 1 : 0;
        score[0] += points; score[1] += 1 - points;
      }
    }
    if (!combinedLocked) {
      if (fixedRank) {
        standings.forEach((r) => { score[teamIds.indexOf(r.entry.teamId!)] += r.points ?? 0; });
      } else {
        const entries = paired ? combined.entries : syntheticPairs(2);
        const rows = entries.map((e) => {
          const totals = combined.sessions.map((s) => {
            const known = paired ? sessionStanding(s, e, input.courses) : { total: 0, complete: 0 };
            const remaining = Math.max(0, (s.holes ?? 9) - known.complete);
            // Net Stableford priors, not a second handicap adjustment. Actual entered
            // totals stay fixed. Matchplay history has deliberately weak influence.
            const baseline = s.key === 'friday' ? 2.35 : 2.2;
            const expected = baseline + .10 * strength(e.playerIds, 'pairs');
            const future = remaining ? Math.max(0, Math.round(remaining * expected + normal() * 1.15 * Math.sqrt(remaining))) : 0;
            return known.total + future;
          });
          return { e, total: totals.reduce((a, b) => a + b, 0), monday: totals[combined.sessions.findIndex((s) => s.key === 'monday')] ?? 0, tie: random() };
        }).sort((a, b) => b.total - a.total || b.monday - a.monday || a.tie - b.tie);
        // Random unresolved positions describe uncertainty only; no ranking decision
        // or point award is ever written back by this predictor.
        rows.forEach((r, rank) => { score[teamIds.indexOf(r.e.teamId!)] += combined.pointAwards[rank]; });
      }
    }
    wins[score[0] > score[1] ? 0 : score[1] > score[0] ? 2 : 1]++;
  }
  const exact = wins.map((n) => n / count * 100);
  const percentages = exact.map(Math.floor);
  const fractions = exact.map((p, i) => ({ i, fraction: p - percentages[i] })).sort((a, b) => b.fraction - a.fraction);
  for (let n = 100 - percentages.reduce((a, b) => a + b, 0), i = 0; i < n; i++) percentages[fractions[i].i]++;
  // Monte Carlo sampling cannot prove certainty. Reserve 100% for the exact
  // confirmed-points checks above, even when a rare comeback was not sampled.
  for (const i of [0, 2]) if (percentages[i] === 100) { percentages[i] = 99; percentages[2 - i]++; }
  return { status: 'ready', teamIds, percentages: percentages as [number, number, number], simulations: count,
    basis: current.some((m) => m.status === 'complete') || observedFriday.length ? 'results' : paired ? 'draws' : 'teams' };
}
