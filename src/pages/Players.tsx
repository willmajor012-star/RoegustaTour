import { PlayerCard } from '../components/PlayerCard';
import { historicalPlayerStats, matchParticipants, matches, players, tourPlayers } from '../data/mockData';
import { calculateAllTimePlayerStats } from '../lib/stats';

export function Players() {
  const stats = calculateAllTimePlayerStats(players, matches, matchParticipants, historicalPlayerStats);
  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Permanent player library</p><h2>Players</h2></section><div className="player-grid">{players.map((player) => <PlayerCard key={player.id} player={player} stats={stats.find((row) => row.playerId === player.id)} toursAttended={tourPlayers.filter((item) => item.playerId === player.id && item.attending).length + historicalPlayerStats.filter((item) => item.playerId === player.id).length} />)}</div></div>;
}
