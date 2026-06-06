import { derivePlayerMatchResultsFromMatch } from './scoring';
import type { Match, MatchFormat, MatchParticipant, Player, PlayerMatchResult, Round, Tour, TourPlayer, TourTeam, TourTeamMember, TourTeamResult } from './types';

export type AdvancedStatsData = {
  players: Player[];
  tours: Tour[];
  tourTeams: TourTeam[];
  tourPlayers?: TourPlayer[];
  tourTeamMembers: TourTeamMember[];
  tourTeamResults: TourTeamResult[];
  rounds: Round[];
  matches: Match[];
  matchParticipants: MatchParticipant[];
  playerMatchResults?: PlayerMatchResult[];
};

export type MatchRecord = {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  pointsWon: number;
  pointsAgainst: number;
  winPercent: number;
};

export type MatchListItem = {
  match: Match;
  tour?: Tour;
  round?: Round;
  sideAPlayers: Player[];
  sideBPlayers: Player[];
  resultText: string;
};

export type PlayerAdvancedSummary = {
  player: Player;
  allTimeRecord: MatchRecord;
  currentTourRecord: MatchRecord;
  singlesRecord: MatchRecord;
  teamFormatRecord: MatchRecord;
  scrambleRecord: MatchRecord;
  currentTourSinglesRecord: MatchRecord;
  currentTourTeamFormatRecord: MatchRecord;
  currentTourScrambleRecord: MatchRecord;
  totalPointsWon: number;
  winPercent: number;
  tourWins: Tour[];
  toursAttended: number;
  bestPartners: RelationshipRanking[];
  mostCommonPartners: RelationshipRanking[];
  toughestOpponents: RelationshipRanking[];
  bestRecordAgainstOpponents: RelationshipRanking[];
  mostCommonOpponents: RelationshipRanking[];
  matchHistory: PlayerMatchHistoryItem[];
};

export type PlayerMatchHistoryItem = {
  match: Match;
  tour?: Tour;
  round?: Round;
  result: PlayerMatchResult;
  partners: Player[];
  opponents: Player[];
};

export type RelationshipRanking = {
  player: Player;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  pointsWon: number;
  pointsAgainst: number;
  winPercent: number;
  lowSample: boolean;
};

export type HeadToHeadRecord = {
  played: number;
  playerAWins: number;
  playerBWins: number;
  draws: number;
  playerAPoints: number;
  playerBPoints: number;
  matches: MatchListItem[];
};

export type PartnerRecord = {
  played: number;
  winsTogether: number;
  drawsTogether: number;
  lossesTogether: number;
  pointsWonTogether: number;
  pointsAgainstTogether: number;
  matches: MatchListItem[];
};

export type HeadToHeadResult = {
  playerA?: Player;
  playerB?: Player;
  opponentRecord: HeadToHeadRecord;
  partnerRecord: PartnerRecord;
  singlesRecord: HeadToHeadRecord;
  allSharedMatches: MatchListItem[];
};

export type MvpLeaderboardRow = {
  player: Player;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  pointsWon: number;
  singlesWins: number;
  unbeatenBonus: number;
  winningTeamBonus: number;
  mvpScore: number;
  explanation: string;
};

export type TourSummary = {
  tour?: Tour;
  teamScore: Array<{ team: TourTeam; points: number; resultStatus?: TourTeamResult['resultStatus'] }>;
  winningTeam?: TourTeam;
  topPointsScorer?: PlayerAdvancedSummary;
  mvpLeader?: MvpLeaderboardRow;
  bestSinglesPlayer?: PlayerAdvancedSummary;
  bestTeamFormatPlayer?: PlayerAdvancedSummary;
  unbeatenPlayers: PlayerAdvancedSummary[];
  totalMatchesCompleted: number;
  remainingMatches: number;
  completedRounds: number;
  summaryCards: Array<{ label: string; value: string; detail?: string }>;
};

const TEAM_FORMATS: MatchFormat[] = ['better_ball', 'scramble', 'custom'];

function blankRecord(): MatchRecord {
  return { matches: 0, wins: 0, draws: 0, losses: 0, pointsWon: 0, pointsAgainst: 0, winPercent: 0 };
}

function finaliseRecord(record: MatchRecord): MatchRecord {
  return { ...record, winPercent: record.matches > 0 ? record.pointsWon / record.matches : 0 };
}

function addResult(record: MatchRecord, result: PlayerMatchResult) {
  if (result.result === 'void') return;
  record.matches += 1;
  record.pointsWon += result.pointsFor;
  record.pointsAgainst += result.pointsAgainst;
  if (result.result === 'win') record.wins += 1;
  if (result.result === 'draw') record.draws += 1;
  if (result.result === 'loss') record.losses += 1;
}

function sortByTourDateDesc(a: Match, b: Match, data: AdvancedStatsData) {
  const tourA = data.tours.find((tour) => tour.id === a.tourId);
  const tourB = data.tours.find((tour) => tour.id === b.tourId);
  return (tourB?.year ?? 0) - (tourA?.year ?? 0) || b.matchNumber - a.matchNumber;
}

export function getCompletedMatches(data: AdvancedStatsData, tourId?: string): Match[] {
  return data.matches.filter((match) => match.status === 'complete' && (!tourId || match.tourId === tourId));
}

export function getMatchPlayerResults(data: AdvancedStatsData, tourId?: string): PlayerMatchResult[] {
  const completedMatches = getCompletedMatches(data, tourId);
  const completedIds = new Set(completedMatches.map((match) => match.id));
  const explicit = (data.playerMatchResults ?? []).filter((result) => completedIds.has(result.matchId) && result.result !== 'void');
  const seen = new Set(explicit.map((result) => `${result.matchId}:${result.playerId}`));
  const derived = completedMatches.flatMap((match) =>
    derivePlayerMatchResultsFromMatch(match, data.matchParticipants.filter((participant) => participant.matchId === match.id))
      .filter((result) => !seen.has(`${result.matchId}:${result.playerId}`) && result.result !== 'void'),
  );
  return [...explicit, ...derived];
}

function getRecordForPlayer(playerId: string, results: PlayerMatchResult[], predicate: (result: PlayerMatchResult) => boolean = () => true): MatchRecord {
  const record = blankRecord();
  results.filter((result) => result.playerId === playerId && predicate(result)).forEach((result) => addResult(record, result));
  return finaliseRecord(record);
}

function playerName(data: AdvancedStatsData, playerId: string) {
  return data.players.find((player) => player.id === playerId)?.displayName ?? 'Unknown player';
}

function matchListItem(match: Match, data: AdvancedStatsData): MatchListItem {
  const participants = data.matchParticipants.filter((participant) => participant.matchId === match.id);
  const sideAPlayers = participants.filter((participant) => participant.side === 'A').map((participant) => data.players.find((player) => player.id === participant.playerId)).filter(Boolean) as Player[];
  const sideBPlayers = participants.filter((participant) => participant.side === 'B').map((participant) => data.players.find((player) => player.id === participant.playerId)).filter(Boolean) as Player[];
  return {
    match,
    tour: data.tours.find((tour) => tour.id === match.tourId),
    round: data.rounds.find((round) => round.id === match.roundId),
    sideAPlayers,
    sideBPlayers,
    resultText: match.resultText ?? `${match.pointsSideA ?? 0}-${match.pointsSideB ?? 0}`,
  };
}


function getPlayerToursAttended(playerId: string, data: AdvancedStatsData): number {
  const tourIds = new Set<string>();

  (data.tourPlayers ?? [])
    .filter((tourPlayer) => tourPlayer.playerId === playerId && tourPlayer.attending)
    .forEach((tourPlayer) => tourIds.add(tourPlayer.tourId));

  data.tourTeamMembers
    .filter((member) => member.playerId === playerId)
    .forEach((member) => tourIds.add(member.tourId));

  (data.playerMatchResults ?? [])
    .filter((result) => result.playerId === playerId)
    .forEach((result) => tourIds.add(result.tourId));

  return tourIds.size;
}

function getPlayerTourWins(playerId: string, data: AdvancedStatsData): Tour[] {
  const winningTeamIds = new Set(data.tourTeamResults.filter((result) => result.resultStatus === 'winner').map((result) => result.teamId));
  const winningTourIds = new Set(data.tourTeamMembers.filter((member) => member.playerId === playerId && winningTeamIds.has(member.teamId)).map((member) => member.tourId));
  return data.tours.filter((tour) => winningTourIds.has(tour.id));
}

export function calculatePlayerAdvancedSummaries(data: AdvancedStatsData, currentTourId?: string): PlayerAdvancedSummary[] {
  const results = getMatchPlayerResults(data);
  const currentTour = currentTourId ?? data.tours.find((tour) => tour.status === 'active')?.id ?? [...data.tours].sort((a, b) => b.year - a.year)[0]?.id;

  return data.players.map((player) => {
    const allTimeRecord = getRecordForPlayer(player.id, results);
    const currentTourRecord = getRecordForPlayer(player.id, results, (result) => result.tourId === currentTour);
    const singlesRecord = getRecordForPlayer(player.id, results, (result) => result.format === 'singles');
    const teamFormatRecord = getRecordForPlayer(player.id, results, (result) => TEAM_FORMATS.includes(result.format));
    const scrambleRecord = getRecordForPlayer(player.id, results, (result) => result.format === 'scramble');
    const currentTourSinglesRecord = getRecordForPlayer(player.id, results, (result) => result.tourId === currentTour && result.format === 'singles');
    const currentTourTeamFormatRecord = getRecordForPlayer(player.id, results, (result) => result.tourId === currentTour && TEAM_FORMATS.includes(result.format));
    const currentTourScrambleRecord = getRecordForPlayer(player.id, results, (result) => result.tourId === currentTour && result.format === 'scramble');
    const matchHistory = getPlayerMatchHistory(player.id, data);
    const relationships = getPartnerOpponentRankings(player.id, data);

    return {
      player,
      allTimeRecord,
      currentTourRecord,
      singlesRecord,
      teamFormatRecord,
      scrambleRecord,
      currentTourSinglesRecord,
      currentTourTeamFormatRecord,
      currentTourScrambleRecord,
      totalPointsWon: allTimeRecord.pointsWon,
      winPercent: allTimeRecord.winPercent,
      tourWins: getPlayerTourWins(player.id, data),
      toursAttended: getPlayerToursAttended(player.id, data),
      ...relationships,
      matchHistory,
    };
  }).filter((summary) => summary.allTimeRecord.matches > 0 || summary.currentTourRecord.matches > 0 || summary.tourWins.length > 0 || summary.toursAttended > 0)
    .sort((a, b) => b.allTimeRecord.pointsWon - a.allTimeRecord.pointsWon || a.player.displayName.localeCompare(b.player.displayName));
}

export function calculateMvpLeaderboard(tourId: string | undefined, data: AdvancedStatsData): MvpLeaderboardRow[] {
  if (!tourId) return [];
  const results = getMatchPlayerResults(data, tourId);
  const winningTeamIds = new Set(data.tourTeamResults.filter((result) => result.tourId === tourId && result.resultStatus === 'winner').map((result) => result.teamId));
  const winningPlayerIds = new Set(data.tourTeamMembers.filter((member) => member.tourId === tourId && winningTeamIds.has(member.teamId)).map((member) => member.playerId));

  return data.players.map((player) => {
    const playerResults = results.filter((result) => result.playerId === player.id);
    const matches = playerResults.length;
    const wins = playerResults.filter((result) => result.result === 'win').length;
    const draws = playerResults.filter((result) => result.result === 'draw').length;
    const losses = playerResults.filter((result) => result.result === 'loss').length;
    const pointsWon = playerResults.reduce((total, result) => total + result.pointsFor, 0);
    const singlesWins = playerResults.filter((result) => result.format === 'singles' && result.result === 'win').length;
    const unbeatenBonus = matches >= 3 && losses === 0 ? 1 : 0;
    const winningTeamBonus = winningPlayerIds.has(player.id) ? 0.5 : 0;
    const mvpScore = pointsWon + wins * 0.25 + singlesWins * 0.5 + unbeatenBonus + winningTeamBonus;
    const explanationParts = [`${formatNumber(pointsWon)} pts`, `${wins} wins`, `${singlesWins} singles wins`];
    if (unbeatenBonus) explanationParts.push('unbeaten bonus');
    if (winningTeamBonus) explanationParts.push('winning-team bonus');
    return { player, matches, wins, draws, losses, pointsWon, singlesWins, unbeatenBonus, winningTeamBonus, mvpScore, explanation: explanationParts.join(', ') };
  }).filter((row) => row.matches > 0)
    .sort((a, b) => b.mvpScore - a.mvpScore || b.pointsWon - a.pointsWon || a.player.displayName.localeCompare(b.player.displayName));
}

export function getHeadToHead(playerAId: string, playerBId: string, data: AdvancedStatsData): HeadToHeadResult {
  const emptyOpponent = (): HeadToHeadRecord => ({ played: 0, playerAWins: 0, playerBWins: 0, draws: 0, playerAPoints: 0, playerBPoints: 0, matches: [] });
  const partnerRecord: PartnerRecord = { played: 0, winsTogether: 0, drawsTogether: 0, lossesTogether: 0, pointsWonTogether: 0, pointsAgainstTogether: 0, matches: [] };
  const opponentRecord = emptyOpponent();
  const singlesRecord = emptyOpponent();
  const allSharedMatches: MatchListItem[] = [];
  const results = getMatchPlayerResults(data);

  getCompletedMatches(data).forEach((match) => {
    const participants = data.matchParticipants.filter((participant) => participant.matchId === match.id);
    const a = participants.find((participant) => participant.playerId === playerAId);
    const b = participants.find((participant) => participant.playerId === playerBId);
    if (!a || !b) return;

    const item = matchListItem(match, data);
    allSharedMatches.push(item);
    const resultA = results.find((result) => result.matchId === match.id && result.playerId === playerAId);
    const resultB = results.find((result) => result.matchId === match.id && result.playerId === playerBId);
    if (!resultA || !resultB) return;

    if (a.side === b.side) {
      partnerRecord.played += 1;
      partnerRecord.pointsWonTogether += resultA.pointsFor;
      partnerRecord.pointsAgainstTogether += resultA.pointsAgainst;
      if (resultA.result === 'win') partnerRecord.winsTogether += 1;
      if (resultA.result === 'draw') partnerRecord.drawsTogether += 1;
      if (resultA.result === 'loss') partnerRecord.lossesTogether += 1;
      partnerRecord.matches.push(item);
      return;
    }

    opponentRecord.played += 1;
    opponentRecord.playerAPoints += resultA.pointsFor;
    opponentRecord.playerBPoints += resultB.pointsFor;
    if (resultA.result === 'win') opponentRecord.playerAWins += 1;
    if (resultB.result === 'win') opponentRecord.playerBWins += 1;
    if (resultA.result === 'draw') opponentRecord.draws += 1;
    opponentRecord.matches.push(item);

    if (match.format === 'singles') {
      singlesRecord.played += 1;
      singlesRecord.playerAPoints += resultA.pointsFor;
      singlesRecord.playerBPoints += resultB.pointsFor;
      if (resultA.result === 'win') singlesRecord.playerAWins += 1;
      if (resultB.result === 'win') singlesRecord.playerBWins += 1;
      if (resultA.result === 'draw') singlesRecord.draws += 1;
      singlesRecord.matches.push(item);
    }
  });

  return {
    playerA: data.players.find((player) => player.id === playerAId),
    playerB: data.players.find((player) => player.id === playerBId),
    opponentRecord,
    partnerRecord,
    singlesRecord,
    allSharedMatches,
  };
}

export function getPartnerOpponentRankings(playerId: string, data: AdvancedStatsData) {
  const partnerMap = new Map<string, RelationshipRanking>();
  const opponentMap = new Map<string, RelationshipRanking>();
  const ensure = (map: Map<string, RelationshipRanking>, id: string) => {
    const player = data.players.find((candidate) => candidate.id === id) ?? { id, displayName: playerName(data, id), active: true, createdAt: '' };
    if (!map.has(id)) map.set(id, { player, matches: 0, wins: 0, draws: 0, losses: 0, pointsWon: 0, pointsAgainst: 0, winPercent: 0, lowSample: true });
    return map.get(id)!;
  };

  getCompletedMatches(data).forEach((match) => {
    const participants = data.matchParticipants.filter((participant) => participant.matchId === match.id);
    const selected = participants.find((participant) => participant.playerId === playerId);
    if (!selected) return;
    const result = getMatchPlayerResults(data).find((item) => item.matchId === match.id && item.playerId === playerId);
    if (!result) return;

    participants.filter((participant) => participant.playerId !== playerId).forEach((participant) => {
      const map = participant.side === selected.side ? partnerMap : opponentMap;
      const row = ensure(map, participant.playerId);
      row.matches += 1;
      row.pointsWon += result.pointsFor;
      row.pointsAgainst += result.pointsAgainst;
      if (result.result === 'win') row.wins += 1;
      if (result.result === 'draw') row.draws += 1;
      if (result.result === 'loss') row.losses += 1;
      row.winPercent = row.matches > 0 ? row.pointsWon / row.matches : 0;
      row.lowSample = row.matches <= 1;
    });
  });

  const partners = [...partnerMap.values()];
  const opponents = [...opponentMap.values()];
  return {
    bestPartners: [...partners].sort((a, b) => b.pointsWon - a.pointsWon || b.winPercent - a.winPercent || a.player.displayName.localeCompare(b.player.displayName)),
    mostCommonPartners: [...partners].sort((a, b) => b.matches - a.matches || b.pointsWon - a.pointsWon || a.player.displayName.localeCompare(b.player.displayName)),
    toughestOpponents: [...opponents].sort((a, b) => a.winPercent - b.winPercent || b.pointsAgainst - a.pointsAgainst || a.player.displayName.localeCompare(b.player.displayName)),
    bestRecordAgainstOpponents: [...opponents].sort((a, b) => b.winPercent - a.winPercent || b.pointsWon - a.pointsWon || a.player.displayName.localeCompare(b.player.displayName)),
    mostCommonOpponents: [...opponents].sort((a, b) => b.matches - a.matches || b.pointsWon - a.pointsWon || a.player.displayName.localeCompare(b.player.displayName)),
  };
}

export function getPlayerMatchHistory(playerId: string, data: AdvancedStatsData): PlayerMatchHistoryItem[] {
  const results = getMatchPlayerResults(data).filter((result) => result.playerId === playerId);
  return results.map((result) => {
    const match = data.matches.find((item) => item.id === result.matchId)!;
    const selected = data.matchParticipants.find((participant) => participant.matchId === match.id && participant.playerId === playerId);
    const participants = data.matchParticipants.filter((participant) => participant.matchId === match.id && participant.playerId !== playerId);
    return {
      match,
      tour: data.tours.find((tour) => tour.id === match.tourId),
      round: data.rounds.find((round) => round.id === match.roundId),
      result,
      partners: participants.filter((participant) => participant.side === selected?.side).map((participant) => data.players.find((player) => player.id === participant.playerId)).filter(Boolean) as Player[],
      opponents: participants.filter((participant) => participant.side !== selected?.side).map((participant) => data.players.find((player) => player.id === participant.playerId)).filter(Boolean) as Player[],
    };
  }).sort((a, b) => sortByTourDateDesc(a.match, b.match, data));
}

export function calculateTourSummary(tourId: string | undefined, data: AdvancedStatsData): TourSummary {
  const tour = data.tours.find((item) => item.id === tourId);
  const completedMatches = getCompletedMatches(data, tourId);
  const tourMatches = tourId ? data.matches.filter((match) => match.tourId === tourId) : [];
  const teamScore = data.tourTeams.filter((team) => team.tourId === tourId).map((team) => {
    const result = data.tourTeamResults.find((item) => item.tourId === tourId && item.teamId === team.id);
    const points = result?.finalPoints ?? completedMatches.reduce((total, match) => {
      if (match.sideATeamId === team.id) return total + (match.pointsSideA ?? 0);
      if (match.sideBTeamId === team.id) return total + (match.pointsSideB ?? 0);
      return total;
    }, 0);
    return { team, points, resultStatus: result?.resultStatus };
  }).sort((a, b) => b.points - a.points || a.team.name.localeCompare(b.team.name));
  const winningTeamId = data.tourTeamResults.find((result) => result.tourId === tourId && result.resultStatus === 'winner')?.teamId;
  const playerSummaries = calculatePlayerAdvancedSummaries(data, tourId).filter((summary) => summary.currentTourRecord.matches > 0);
  const mvpLeaderboard = calculateMvpLeaderboard(tourId, data);
  const topPointsScorer = [...playerSummaries].sort((a, b) => b.currentTourRecord.pointsWon - a.currentTourRecord.pointsWon)[0];
  const bestSinglesPlayer = [...playerSummaries].filter((summary) => summary.currentTourSinglesRecord.matches > 0).sort((a, b) => b.currentTourSinglesRecord.winPercent - a.currentTourSinglesRecord.winPercent || b.currentTourSinglesRecord.pointsWon - a.currentTourSinglesRecord.pointsWon)[0];
  const bestTeamFormatPlayer = [...playerSummaries].filter((summary) => summary.currentTourTeamFormatRecord.matches > 0).sort((a, b) => b.currentTourTeamFormatRecord.winPercent - a.currentTourTeamFormatRecord.winPercent || b.currentTourTeamFormatRecord.pointsWon - a.currentTourTeamFormatRecord.pointsWon)[0];
  const unbeatenPlayers = playerSummaries.filter((summary) => summary.currentTourRecord.matches > 0 && summary.currentTourRecord.losses === 0);
  const completedRoundIds = new Set(completedMatches.map((match) => match.roundId));
  const leader = winningTeamId ? data.tourTeams.find((team) => team.id === winningTeamId) : teamScore[0]?.team;

  return {
    tour,
    teamScore,
    winningTeam: winningTeamId ? data.tourTeams.find((team) => team.id === winningTeamId) : undefined,
    topPointsScorer,
    mvpLeader: mvpLeaderboard[0],
    bestSinglesPlayer,
    bestTeamFormatPlayer,
    unbeatenPlayers,
    totalMatchesCompleted: completedMatches.length,
    remainingMatches: Math.max(0, tourMatches.filter((match) => match.status !== 'complete' && match.status !== 'void').length),
    completedRounds: completedRoundIds.size,
    summaryCards: [
      { label: 'Team score', value: teamScore.length ? teamScore.map((row) => `${row.team.name} ${formatNumber(row.points)}`).join(' · ') : 'No team score yet' },
      { label: winningTeamId ? 'Winning team' : 'Leading team', value: leader?.name ?? 'TBC' },
      { label: 'Top points scorer', value: topPointsScorer ? topPointsScorer.player.displayName : 'TBC' },
      { label: 'MVP leader', value: mvpLeaderboard[0] ? mvpLeaderboard[0].player.displayName : 'TBC' },
      { label: 'Completed matches', value: String(completedMatches.length), detail: `${Math.max(0, tourMatches.length - completedMatches.length)} remaining` },
    ],
  };
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
