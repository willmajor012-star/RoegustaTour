import type { Match, MatchParticipant, Player, TourTeam } from '../lib/types';
import { formatMatchFormat, formatPoints } from '../lib/formatting';
import { normalizeMatchplayResult } from '../lib/matchplay';
import { formatTeeTimeDisplay } from '../lib/display';
import { normalizeTeamColour } from '../lib/teamColours';
import type { CSSProperties } from 'react';

type Props = { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] };


function hasPointScore(match: Match) {
  return typeof match.pointsSideA === 'number' && typeof match.pointsSideB === 'number';
}

function pointsResultLabel(match: Match) {
  if (!hasPointScore(match)) return '';
  return `${formatPoints(match.pointsSideA ?? 0)}–${formatPoints(match.pointsSideB ?? 0)}`;
}

function resultLabel(match: Match) {
  const controlledLabel = normalizeMatchplayResult(match.resultText);
  if (controlledLabel) return controlledLabel;
  if (match.status === 'complete' && match.winningSide && match.winningSide !== 'void') return pointsResultLabel(match);
  return '';
}


function sideState(match: Match, side: 'A' | 'B') {
  if (match.winningSide === 'halved') return 'halved';
  if (match.winningSide === side) return 'winner';
  if (match.status === 'complete' && (match.winningSide === 'A' || match.winningSide === 'B')) return 'loser';
  return undefined;
}

export function MatchCard({ match, participants, players, teams }: Props) {
  const playerFor = (playerId: string) => players.find((player) => player.id === playerId);
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId);
  const sideLabel = (teamId: string, customLabel?: string) => customLabel?.trim() || teamFor(teamId)?.name || 'Team TBC';
  const sideAPlayers = participants.filter((participant) => participant.side === 'A').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const sideBPlayers = participants.filter((participant) => participant.side === 'B').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const tee = match.teeTime?.trim() ? formatTeeTimeDisplay(match.teeTime) : undefined;
  const result = resultLabel(match);

  return (
    <article className={`match-card result-${match.winningSide ?? match.status}`}>
      <div className="match-card-topline"><span>Match {match.matchNumber}</span><span>{formatMatchFormat(match.format)}</span>{tee && <span>Tee {tee}</span>}</div>
      <div className="match-ledger-row">
        <MatchSide label={sideLabel(match.sideATeamId, match.sideALabel)} players={sideAPlayers} colour={normalizeTeamColour(teamFor(match.sideATeamId)?.colour, 0)} state={sideState(match, 'A')} />
        <div className={`result-chip ${match.status === 'complete' ? 'complete' : ''}`} aria-label={result ? `Match score ${result}` : 'Match score unavailable'}>{result}</div>
        <MatchSide label={sideLabel(match.sideBTeamId, match.sideBLabel)} players={sideBPlayers} colour={normalizeTeamColour(teamFor(match.sideBTeamId)?.colour, 1)} state={sideState(match, 'B')} align="right" />
        <MatchSide label={teamName(match.sideATeamId, match.sideALabel || 'Team unavailable')} players={sideAPlayers} colour={normalizeTeamColour(teamFor(match.sideATeamId)?.colour, 0)} state={sideState(match, 'A')} />
        <div className={`result-chip ${match.status === 'complete' ? 'complete' : ''}`} aria-label={result ? `Match score ${result}` : 'Match score unavailable'}>{result}</div>
        <MatchSide label={teamName(match.sideBTeamId, match.sideBLabel || 'Team unavailable')} players={sideBPlayers} colour={normalizeTeamColour(teamFor(match.sideBTeamId)?.colour, 1)} state={sideState(match, 'B')} align="right" />
      </div>
    </article>
  );
}

function MatchSide({ label, players, colour, state, align }: { label: string; players: Player[]; colour: string; state?: 'winner' | 'loser' | 'halved'; align?: 'right' }) {
  const names = players.map((player) => player.displayName).join(' / ');
  return <div className={`match-side ${align === 'right' ? 'right' : ''} ${state ?? ''}`} style={{ '--team-colour': colour } as CSSProperties}>
    <strong>{names || label || 'Players TBC'}</strong>
    {names && <span>{label}</span>}
  </div>;
}
