import type { CSSProperties } from 'react';
import type { Match, MatchParticipant, Player, TourTeam } from '../lib/types';
import { formatMatchFormat, formatPoints } from '../lib/formatting';
import { getPlayerInitials } from '../lib/people';

type Props = { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] };

export function MatchCard({ match, participants, players, teams }: Props) {
  const playerFor = (playerId: string) => players.find((player) => player.id === playerId);
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId);
  const teamName = (teamId: string) => teamFor(teamId)?.name ?? 'Team';
  const sideAPlayers = participants.filter((participant) => participant.side === 'A').map((participant) => playerFor(participant.playerId));
  const sideBPlayers = participants.filter((participant) => participant.side === 'B').map((participant) => playerFor(participant.playerId));
  const resultLabel = match.resultText ?? `${formatPoints(match.pointsAvailable)} point${match.pointsAvailable === 1 ? '' : 's'} available`;
  const isComplete = match.status === 'complete';

  return (
    <article className={`match-card card result-${match.winningSide ?? match.status}`}>
      <div className="card-meta"><span>Match {match.matchNumber}</span><span>{formatMatchFormat(match.format)}</span><span>{match.status}</span></div>
      <div className="match-result-grid">
        <MatchSide label={match.sideALabel ?? teamName(match.sideATeamId)} colour={teamFor(match.sideATeamId)?.colour} players={sideAPlayers} state={match.winningSide === 'A' ? 'winner' : match.winningSide === 'halved' ? 'halved' : undefined} />
        <div className={`result-chip ${isComplete ? 'complete' : ''}`}>{resultLabel}</div>
        <MatchSide label={match.sideBLabel ?? teamName(match.sideBTeamId)} colour={teamFor(match.sideBTeamId)?.colour ?? '#6E2635'} players={sideBPlayers} state={match.winningSide === 'B' ? 'winner' : match.winningSide === 'halved' ? 'halved' : undefined} align="right" />
      </div>
      {match.teeTime && <footer className="match-footer">Tee {match.teeTime}</footer>}
    </article>
  );
}

function MatchSide({ label, colour, players, state, align }: { label: string; colour?: string; players: Array<Player | undefined>; state?: 'winner' | 'halved'; align?: 'right' }) {
  return <div className={`match-side ${align === 'right' ? 'right' : ''} ${state ?? ''}`} style={{ '--team-colour': colour ?? '#0F2F24' } as CSSProperties}>
    <strong>{label}</strong>
    <div className="player-token-list">
      {players.length === 0 ? <span className="muted">Players TBC</span> : players.map((player, index) => <span className="player-token" key={player?.id ?? index}><b>{getPlayerInitials(player)}</b>{player?.displayName ?? 'Unknown'}</span>)}
    </div>
  </div>;
}
