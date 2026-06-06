import type { LeaderboardRow } from '../lib/types';
import { formatPercent, formatPoints } from '../lib/formatting';

type Props = { rows: LeaderboardRow[] };
export function LeaderboardTable({ rows }: Props) {
  return (
    <div className="table-wrap card"><table><thead><tr><th>Player</th><th>M</th><th>W</th><th>D</th><th>L</th><th>Pts</th><th>%</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.playerId}><td>{row.playerName}</td><td>{row.matches}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{formatPoints(row.points)}</td><td>{formatPercent(row.winPercent)}</td></tr>)}
    </tbody></table></div>
  );
}
