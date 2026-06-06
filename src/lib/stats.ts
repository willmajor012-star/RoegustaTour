import type { HistoricalPlayerStats, LeaderboardRow, Match, MatchFormat, MatchParticipant, Player, PlayerMatchResult } from './types';
import { derivePlayerMatchResultsFromMatch } from './scoring';

type LeaderboardAccumulator = LeaderboardRow;
type NormalizedHistoricalStats = Pick<HistoricalPlayerStats, 'playerId' | 'matches' | 'wins' | 'draws' | 'losses' | 'points' | 'winPercent'>;

function blankRow(player: Player): LeaderboardAccumulator {
  return { playerId: player.id, playerName: player.displayName, matches: 0, wins: 0, draws: 0, losses: 0, points: 0, winPercent: 0 };
}

function finalise(row: LeaderboardAccumulator): LeaderboardRow {
  return { ...row, winPercent: row.matches > 0 ? row.points / row.matches : 0 };
}

function addResult(row: LeaderboardAccumulator, result: PlayerMatchResult) {
  if (result.result === 'win') {
    row.wins += 1;
    row.matches += 1;
    row.points += 1;
  }
  if (result.result === 'draw') {
    row.draws += 1;
    row.matches += 1;
    row.points += 0.5;
  }
  if (result.result === 'loss') {
    row.losses += 1;
    row.matches += 1;
  }
}

export function normalizeHistoricalPlayerStats(historic: HistoricalPlayerStats): NormalizedHistoricalStats {
  const matches = historic.wins + historic.draws + historic.losses;
  const points = historic.wins + historic.draws * 0.5;
  return {
    playerId: historic.playerId,
    matches,
    wins: historic.wins,
    draws: historic.draws,
    losses: historic.losses,
    points,
    winPercent: matches > 0 ? points / matches : 0,
  };
}

export function sortLeaderboard(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort(
    (a, b) =>
      b.winPercent - a.winPercent ||
      b.points - a.points ||
      b.matches - a.matches ||
      a.playerName.localeCompare(b.playerName),
  );
}

export function calculatePlayerStatsByTour(tourId: string, players: Player[], matches: Match[], participants: MatchParticipant[]): LeaderboardRow[] {
  const rows = new Map(players.map((player) => [player.id, blankRow(player)]));
  matches
    .filter((match) => match.tourId === tourId)
    .flatMap((match) => derivePlayerMatchResultsFromMatch(match, participants.filter((participant) => participant.matchId === match.id)))
    .forEach((result) => {
      const row = rows.get(result.playerId);
      if (row) addResult(row, result);
    });

  return sortLeaderboard([...rows.values()].map(finalise).filter((row) => row.matches > 0));
}

export function calculateAllTimePlayerStats(
  players: Player[],
  matches: Match[],
  participants: MatchParticipant[],
  historicalStats: HistoricalPlayerStats[],
): LeaderboardRow[] {
  const rows = new Map(players.map((player) => [player.id, blankRow(player)]));

  matches
    .flatMap((match) => derivePlayerMatchResultsFromMatch(match, participants.filter((participant) => participant.matchId === match.id)))
    .forEach((result) => {
      const row = rows.get(result.playerId);
      if (row) addResult(row, result);
    });

  historicalStats.map(normalizeHistoricalPlayerStats).forEach((historic) => {
    const row = rows.get(historic.playerId);
    if (!row) return;
    row.matches += historic.matches;
    row.wins += historic.wins;
    row.draws += historic.draws;
    row.losses += historic.losses;
    row.points += historic.points;
  });

  return sortLeaderboard([...rows.values()].map(finalise).filter((row) => row.matches > 0));
}

export function calculatePlayerStatsByFormat(
  format: MatchFormat,
  players: Player[],
  matches: Match[],
  participants: MatchParticipant[],
): LeaderboardRow[] {
  return calculatePlayerStatsByTour('all', players, matches.map((match) => ({ ...match, tourId: 'all' })).filter((match) => match.format === format), participants);
}
