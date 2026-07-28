import type { Match, Round, TourPlayer, TourTeam, TourTeamMember } from './types';

export const MATCHPLAY_RESULT_OPTIONS = [
  'AS', '1 Up', '2 Up', '2 & 1', '3 & 2', '3 & 1', '4 & 3', '4 & 2', '5 & 4', '5 & 3',
  '6 & 5', '6 & 4', '7 & 6', '7 & 5', '8 & 7', '8 & 6', '9 & 8', '9 & 7', '10 & 8',
] as const;

export type MatchplayResultCode = typeof MATCHPLAY_RESULT_OPTIONS[number];

export const NINE_HOLE_MATCHPLAY_RESULT_OPTIONS = [
  'AS', '1 Up', '2 Up', '2 & 1', '3 & 2', '3 & 1', '4 & 3', '4 & 2', '5 & 4',
] as const;

export function matchplayResultOptionsForHoles(holes?: number | null): readonly MatchplayResultCode[] {
  return holes === 9 ? NINE_HOLE_MATCHPLAY_RESULT_OPTIONS : MATCHPLAY_RESULT_OPTIONS;
}


const NORMALIZED_TO_LABEL = new Map(MATCHPLAY_RESULT_OPTIONS.map((label) => [label.toLowerCase().replace(/\s+/g, '').replace('&', '&'), label]));

export function normalizeMatchplayResult(value?: string | null): MatchplayResultCode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '').replace('up', 'up');
  if (normalized === 'as') return 'AS';
  const compact = normalized.replace('up', 'up');
  return NORMALIZED_TO_LABEL.get(compact) as MatchplayResultCode | undefined;
}

export function isValidMatchplayResult(value?: string | null): value is MatchplayResultCode {
  return Boolean(normalizeMatchplayResult(value));
}

export function isValidMatchplayResultForHoles(value?: string | null, holes?: number | null): value is MatchplayResultCode {
  const normalized = normalizeMatchplayResult(value);
  return Boolean(normalized && matchplayResultOptionsForHoles(holes).includes(normalized));
}

export function deriveMatchPoints(winningSide: Match['winningSide'] | '' | null | undefined, pointsAvailable = 1) {
  const points = Number.isFinite(pointsAvailable) && pointsAvailable > 0 ? pointsAvailable : 1;
  if (winningSide === 'A') return { pointsSideA: points, pointsSideB: 0 };
  if (winningSide === 'B') return { pointsSideA: 0, pointsSideB: points };
  if (winningSide === 'halved') return { pointsSideA: points / 2, pointsSideB: points / 2 };
  return { pointsSideA: 0, pointsSideB: 0 };
}

export function totalAvailablePoints(matches: Match[]) {
  return matches.filter((match) => match.status !== 'void').reduce((sum, match) => sum + (match.pointsAvailable || 1), 0);
}

export function awardedPoints(matches: Match[]) {
  return matches.filter((match) => match.status === 'complete').reduce((sum, match) => sum + (match.pointsSideA ?? 0) + (match.pointsSideB ?? 0), 0);
}

export function pointsRequiredToWinOutright(totalAvailable: number) {
  return totalAvailable > 0 ? Math.floor(totalAvailable + 1) / 2 : undefined;
}

function playersPerSide(format?: Round['format']) {
  if (format === 'singles') return 1;
  if (format === 'better_ball' || format === 'foursomes' || format === 'scramble') return 2;
  return undefined;
}

function availablePlayersPerTeam(
  teams: TourTeam[],
  members: TourTeamMember[],
  tourPlayers: TourPlayer[],
  attendingPlayerCount?: number,
) {
  const attendanceByPlayer = new Map(tourPlayers.map((player) => [player.playerId, player.attending]));
  const teamCounts = teams.slice(0, 2).map((team) => new Set(
    members
      .filter((member) => member.teamId === team.id && attendanceByPlayer.get(member.playerId) !== false)
      .map((member) => member.playerId),
  ).size);
  if (teamCounts.length === 2 && teamCounts.every((count) => count > 0)) return Math.min(...teamCounts);

  const attendingPlayers = Math.max(
    tourPlayers.filter((player) => player.attending).length,
    attendingPlayerCount ?? 0,
  );
  return teams.length >= 2 ? Math.floor(attendingPlayers / 2) : 0;
}

/**
 * Use the real match ledger wherever it exists. Before pairings are created,
 * infer one-point matches from the round format and the available two-team
 * roster so the Home target remains useful throughout tour setup.
 */
export function projectedTourPoints(
  rounds: Round[],
  matches: Match[],
  teams: TourTeam[],
  members: TourTeamMember[],
  tourPlayers: TourPlayer[],
  attendingPlayerCount?: number,
) {
  const playersOnEachTeam = availablePlayersPerTeam(teams, members, tourPlayers, attendingPlayerCount);
  return rounds
    .filter((round) => round.status !== 'draft')
    .reduce((tourTotal, round) => {
      const roundMatches = matches.filter((match) => (
        match.roundId === round.id
        && match.status !== 'void'
        && match.winningSide !== 'void'
      ));
      const sideSize = playersPerSide(round.format);
      const projectedRoundPoints = sideSize && playersOnEachTeam > 0
        ? Math.floor(playersOnEachTeam / sideSize)
        : 0;
      const ledgerRoundPoints = totalAvailablePoints(roundMatches);
      return tourTotal + Math.max(projectedRoundPoints, ledgerRoundPoints);
    }, 0);
}
