import type { Match, MatchParticipant, Player, TourTeam } from '../lib/types';
import { formatMatchFormat, formatPoints } from '../lib/formatting';
import { normalizeTeeTime } from '../lib/display';

type Props = { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] };

const SHORT_RESULT_PATTERN = /^(?:\d+\s*&\s*\d+|\d+\s*UP|AS|TBC|\d+(?:\.5)?\s*pt?s?|\d+(?:\.5)?\s*[–-]\s*\d+(?:\.5)?)$/i;
const EMBEDDED_RESULT_PATTERN = /\b(\d+\s*&\s*\d+|\d+\s*UP|AS)\b/i;

function pointsResultLabel(match: Match) {
  const sideA = match.pointsSideA ?? 0;
  const sideB = match.pointsSideB ?? 0;
  if (match.winningSide === 'halved') return 'AS';
  if (match.pointsAvailable === 1 && ((sideA === 1 && sideB === 0) || (sideB === 1 && sideA === 0))) return '1 pt';
  return `${formatPoints(sideA)}–${formatPoints(sideB)}`;
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
  return 'TBC';
}

export function MatchCard({ match, participants, players, teams }: Props) {
  const playerFor = (playerId: string) => players.find((player) => player.id === playerId);
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId);
  const teamName = (teamId: string, fallback: string) => teamFor(teamId)?.name ?? fallback;
  const sideAPlayers = participants.filter((participant) => participant.side === 'A').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const sideBPlayers = participants.filter((participant) => participant.side === 'B').map((participant) => playerFor(participant.playerId)).filter((player): player is Player => Boolean(player));
  const tee = normalizeTeeTime(match.teeTime);

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
