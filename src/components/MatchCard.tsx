import type { Match, MatchParticipant, Player, TourTeam } from '../lib/types';
import { formatMatchFormat, formatPoints } from '../lib/formatting';
import { normalizeTeeTime } from '../lib/display';
import { normalizeTeamColour } from '../lib/teamColours';
import type { CSSProperties } from 'react';

type Props = { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] };

const SHORT_RESULT_PATTERN = /^(?:\d+\s*&\s*\d+|\d+\s*UP|AS|TBC|\d+(?:\.5)?\s*pt?s?|\d+(?:\.5)?\s*[–-]\s*\d+(?:\.5)?)$/i;
const EMBEDDED_RESULT_PATTERN = /\b(\d+\s*&\s*\d+|\d+\s*UP|AS)\b/i;

function hasPointScore(match: Match) {
  return typeof match.pointsSideA === 'number' && typeof match.pointsSideB === 'number';
}

function pointsResultLabel(match: Match) {
  if (!hasPointScore(match)) return '';
  return `${formatPoints(match.pointsSideA ?? 0)}–${formatPoints(match.pointsSideB ?? 0)}`;
}

function resultLabel(match: Match) {
  const resultText = match.resultText?.trim();
  if (resultText && SHORT_RESULT_PATTERN.test(resultText)) {
    const cleaned = resultText.replace(/\s+/g, ' ').trim().replace(/\s*&\s*/g, '&').replace(/\s*[–-]\s*/g, '–');
    if (/(?:up|as)$/i.test(cleaned)) return cleaned.replace(/\s+UP/i, 'UP').toUpperCase();
    return cleaned.replace(/pts?/i, (unit) => unit.toLowerCase());
  }
  const embeddedResult = resultText?.match(EMBEDDED_RESULT_PATTERN)?.[1];
  if (embeddedResult) return embeddedResult.replace(/\s+/g, '').toUpperCase();
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
  const teamName = (teamId: string, fallback: string) => teamFor(teamId)?.name ?? fallback;
  const sideAPlayers = participants.filter((participant) => participant.side === 'A').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const sideBPlayers = participants.filter((participant) => participant.side === 'B').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const tee = normalizeTeeTime(match.teeTime);
  const result = resultLabel(match);

  return (
    <article className={`match-card result-${match.winningSide ?? match.status}`}>
      <div className="match-card-topline"><span>Match {match.matchNumber}</span><span>{formatMatchFormat(match.format)}</span>{tee && <span>Tee {tee}</span>}</div>
      <div className="match-ledger-row">
        <MatchSide label={match.sideALabel ?? teamName(match.sideATeamId, 'Team 1')} players={sideAPlayers} colour={normalizeTeamColour(teamFor(match.sideATeamId)?.colour, 0)} state={sideState(match, 'A')} />
        <div className={`result-chip ${match.status === 'complete' ? 'complete' : ''}`} aria-label={result ? `Match score ${result}` : 'Match score unavailable'}>{result}</div>
        <MatchSide label={match.sideBLabel ?? teamName(match.sideBTeamId, 'Team 2')} players={sideBPlayers} colour={normalizeTeamColour(teamFor(match.sideBTeamId)?.colour, 1)} state={sideState(match, 'B')} align="right" />
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
