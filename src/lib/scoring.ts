import type { Match, MatchParticipant, PlayerMatchResult, Round, TeamScoreRow, TourTeam } from './types';

export function derivePlayerMatchResultsFromMatch(match: Match, participants: MatchParticipant[]): PlayerMatchResult[] {
  if (match.status === 'void' || match.winningSide === 'void') {
    return participants.map((participant) => ({
      id: `${match.id}-${participant.playerId}`,
      tourId: match.tourId,
      roundId: match.roundId,
      matchId: match.id,
      playerId: participant.playerId,
      teamId: participant.teamId,
      format: match.format,
      result: 'void',
      pointsFor: 0,
      pointsAgainst: 0,
    }));
  }

  if (match.status !== 'complete' || !match.winningSide) return [];

  return participants.map((participant) => {
    const isSideA = participant.side === 'A';
    const pointsFor = isSideA ? match.pointsSideA ?? 0 : match.pointsSideB ?? 0;
    const pointsAgainst = isSideA ? match.pointsSideB ?? 0 : match.pointsSideA ?? 0;
    let result: PlayerMatchResult['result'] = 'draw';

    if (match.winningSide === 'A') result = isSideA ? 'win' : 'loss';
    if (match.winningSide === 'B') result = isSideA ? 'loss' : 'win';
    if (match.winningSide === 'halved') result = 'draw';

    return {
      id: `${match.id}-${participant.playerId}`,
      tourId: match.tourId,
      roundId: match.roundId,
      matchId: match.id,
      playerId: participant.playerId,
      teamId: participant.teamId,
      format: match.format,
      result,
      pointsFor,
      pointsAgainst,
    };
  });
}

export function calculateTeamScoreByTour(tourId: string, teams: TourTeam[], rounds: Round[], matches: Match[]): TeamScoreRow[] {
  const tourRounds = rounds.filter((round) => round.tourId === tourId);
  const scores = teams
    .filter((team) => team.tourId === tourId)
    .map<TeamScoreRow>((team) => ({
      teamId: team.id,
      teamName: team.name,
      colour: team.colour,
      points: 0,
      pointsByRound: Object.fromEntries(tourRounds.map((round) => [round.id, 0])),
    }));

  const scoreByTeam = new Map(scores.map((score) => [score.teamId, score]));

  matches
    .filter((match) => match.tourId === tourId && match.status === 'complete')
    .forEach((match) => {
      const sideA = scoreByTeam.get(match.sideATeamId);
      const sideB = scoreByTeam.get(match.sideBTeamId);
      if (sideA) {
        const points = match.pointsSideA ?? 0;
        sideA.points += points;
        sideA.pointsByRound[match.roundId] = (sideA.pointsByRound[match.roundId] ?? 0) + points;
      }
      if (sideB) {
        const points = match.pointsSideB ?? 0;
        sideB.points += points;
        sideB.pointsByRound[match.roundId] = (sideB.pointsByRound[match.roundId] ?? 0) + points;
      }
    });

  return scores.sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName));
}
