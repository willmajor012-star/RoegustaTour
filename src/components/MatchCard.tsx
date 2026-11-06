import type { Match, MatchParticipant, Player, TourTeam } from '../lib/types';
import { formatMatchFormat, formatPoints } from '../lib/formatting';
import { normalizeMatchplayResult } from '../lib/matchplay';
import { formatTeeTimeDisplay } from '../lib/display';
import { comparePairingSides, PairingRow } from './PairingRow';

type Props = { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[]; teeSheet?: boolean; context?: string };


function hasPointScore(match: Match) {
  return typeof match.pointsSideA === 'number' && typeof match.pointsSideB === 'number';
}

function pointsResultLabel(match: Match, reversed: boolean) {
  if (!hasPointScore(match)) return '';
  const points = reversed ? [match.pointsSideB, match.pointsSideA] : [match.pointsSideA, match.pointsSideB];
  return points.map((value) => formatPoints(value ?? 0)).join('–');
}

function resultLabel(match: Match, reversed: boolean) {
  const controlledLabel = normalizeMatchplayResult(match.resultText);
  if (controlledLabel) return controlledLabel;
  if (match.status === 'complete') return pointsResultLabel(match, reversed);
  return '';
}


export function MatchCard({ match, participants, players, teams, teeSheet = false, context }: Props) {
  const tee = match.teeTime?.trim() || teeSheet ? formatTeeTimeDisplay(match.teeTime) : undefined;
  const label = context ?? `Match ${match.matchNumber} · ${formatMatchFormat(match.format)}`;
  const sides = (['A', 'B'] as const).map((side, index) => {
    const teamId = side === 'A' ? match.sideATeamId : match.sideBTeamId;
    const customLabel = side === 'A' ? match.sideALabel : match.sideBLabel;
    const team = teams.find((team) => team.id === teamId);
    const names = participants.filter((participant) => participant.side === side)
      .flatMap((participant) => players.find((player) => player.id === participant.playerId)?.displayName ?? [])
      .join(' & ');
    return { id: side, team, label: `Team ${index + 1}`, names: names || customLabel?.trim() || 'Players TBC',
      note: !teeSheet && match.winningSide === side ? 'Winner' : undefined };
  });
  const result = teeSheet ? undefined : resultLabel(match, comparePairingSides(sides[0], sides[1]) > 0);
  return <PairingRow time={tee} label={label} detail={result || (match.winningSide === 'halved' && !teeSheet ? 'Halved' : undefined)} lineups={[sides]} />;
}
