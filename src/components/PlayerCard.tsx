import type { LeaderboardRow, Player } from '../lib/types';
import { formatPercent, formatPoints } from '../lib/formatting';

type Props = { player: Player; stats?: LeaderboardRow; toursAttended: number };
export function PlayerCard({ player, stats, toursAttended }: Props) {
  return <article className="player-card card"><div className="avatar">{player.initials}</div><div><h3>{player.displayName}</h3><p>{player.nickname ? `“${player.nickname}” · ` : ''}{toursAttended} tour{toursAttended === 1 ? '' : 's'} attended</p><span>{stats ? `${stats.matches} matches · ${stats.wins}/${stats.draws}/${stats.losses} · ${formatPoints(stats.points)} pts · ${formatPercent(stats.winPercent)}` : 'No results yet'}</span></div></article>;
}
