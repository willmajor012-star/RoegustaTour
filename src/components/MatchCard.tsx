import type { Match, MatchParticipant, Player, TourTeam } from '../lib/types';
import { formatMatchFormat, formatPoints } from '../lib/formatting';
import { normalizeTeeTime } from '../lib/display';

type Props = { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] };

function resultLabel(match: Match) {
  if (match.resultText) return match.resultText;
  if (match.status === 'complete') return match.winningSide === 'halved' ? 'AS' : `${formatPoints(match.pointsSideA ?? 0)}–${formatPoints(match.pointsSideB ?? 0)}`;
  return `${formatPoints(match.pointsAvailable)} pt${match.pointsAvailable === 1 ? '' : 's'}`;
}

export function MatchCard({ match, participants, players, teams }: Props) {
  const playerFor = (playerId: string) => players.find((player) => player.id === playerId);
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId);
  const teamName = (teamId: string, fallback: string) => teamFor(teamId)?.name ?? fallback;
  const sideAPlayers = participants.filter((participant) => participant.side === 'A').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const sideBPlayers = participants.filter((participant) => participant.side === 'B').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const tee = normalizeTeeTime(match.teeTime) ?? match.teeTime;

  return (
    <article className={`match-card result-${match.winningSide ?? match.status}`}>
      <div className="match-card-topline"><span>Match {match.matchNumber}</span><span>{formatMatchFormat(match.format)}</span>{tee && <span>Tee {tee}</span>}</div>
      <div className="match-ledger-row">
        <MatchSide label={match.sideALabel ?? teamName(match.sideATeamId, 'Team 1')} players={sideAPlayers} state={match.winningSide === 'A' ? 'winner' : match.winningSide === 'halved' ? 'halved' : undefined} />
        <div className={`result-chip ${match.status === 'complete' ? 'complete' : ''}`}>{resultLabel(match)}</div>
        <MatchSide label={match.sideBLabel ?? teamName(match.sideBTeamId, 'Team 2')} players={sideBPlayers} state={match.winningSide === 'B' ? 'winner' : match.winningSide === 'halved' ? 'halved' : undefined} align="right" />
      </div>
    </article>
  );
}

function MatchSide({ label, players, state, align }: { label: string; players: Player[]; state?: 'winner' | 'halved'; align?: 'right' }) {
  const names = players.map((player) => player.displayName).join(' / ');
  return <div className={`match-side ${align === 'right' ? 'right' : ''} ${state ?? ''}`}>
    <strong>{names || label || 'Players TBC'}</strong>
    {names && <span>{label}</span>}
  </div>;
}
