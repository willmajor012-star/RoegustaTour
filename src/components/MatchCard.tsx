import type { Match, MatchParticipant, Player, TourTeam } from '../lib/types';
import { formatMatchFormat, formatPoints } from '../lib/formatting';

type Props = { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] };
export function MatchCard({ match, participants, players, teams }: Props) {
  const nameFor = (playerId: string) => players.find((player) => player.id === playerId)?.displayName ?? 'Unknown';
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId)?.name ?? 'Team';
  const sideA = participants.filter((participant) => participant.side === 'A').map((participant) => nameFor(participant.playerId)).join(', ');
  const sideB = participants.filter((participant) => participant.side === 'B').map((participant) => nameFor(participant.playerId)).join(', ');
  return (
    <article className="match-card card">
      <div className="card-meta"><span>Match {match.matchNumber}</span><span>{formatMatchFormat(match.format)}</span><span>{match.status}</span></div>
      <div className="match-sides">
        <div><strong>{match.sideALabel ?? teamFor(match.sideATeamId)}</strong><p>{sideA}</p></div>
        <span className="versus">v</span>
        <div><strong>{match.sideBLabel ?? teamFor(match.sideBTeamId)}</strong><p>{sideB}</p></div>
      </div>
      <footer>{match.resultText ?? `${formatPoints(match.pointsAvailable)} point available`}</footer>
    </article>
  );
}
