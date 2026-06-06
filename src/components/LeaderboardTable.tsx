import type { LeaderboardRow } from '../lib/types';
import { formatPercent, formatPoints } from '../lib/formatting';

type Props = {
  rows: LeaderboardRow[];
  selectedPlayerId?: string;
  onSelectPlayer?: (playerId: string) => void;
};

export function LeaderboardTable({ rows, selectedPlayerId, onSelectPlayer }: Props) {
  return (
    <div className="table-wrap card leaderboard-table"><table><thead><tr><th>Player</th><th>M</th><th>W</th><th>D</th><th>L</th><th>Pts</th><th>%</th></tr></thead><tbody>
      {rows.map((row) => <tr className={selectedPlayerId === row.playerId ? 'selected-row' : ''} key={row.playerId} onClick={() => onSelectPlayer?.(row.playerId)}><td>{row.playerName}</td><td>{row.matches}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{formatPoints(row.points)}</td><td>{formatPercent(row.winPercent)}</td></tr>)}
    </tbody></table></div>
  );
}
