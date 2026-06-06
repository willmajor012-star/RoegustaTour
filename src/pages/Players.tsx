import { PlayerCard } from '../components/PlayerCard';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import type { LeaderboardRow } from '../lib/types';

const emptyAdvancedStats: Omit<PublicAdvancedStatsResponse, 'source'> = { players: [], tours: [], tourTeams: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };

function toPlayerStats(summary?: { allTimeRecord: { matches: number; wins: number; draws: number; losses: number; pointsWon: number; winPercent: number }; player: { id: string; displayName: string } }): LeaderboardRow | undefined {
  if (!summary) return undefined;
  return {
    playerId: summary.player.id,
    playerName: summary.player.displayName,
    matches: summary.allTimeRecord.matches,
    wins: summary.allTimeRecord.wins,
    draws: summary.allTimeRecord.draws,
    losses: summary.allTimeRecord.losses,
    points: summary.allTimeRecord.pointsWon,
    winPercent: summary.allTimeRecord.winPercent,
  };
}

export function Players() {
  const { data, loading, error } = usePublicData(fetchPublicAdvancedStats);
  const activeData = data ?? emptyAdvancedStats;
  const summaries = activeData.playerSummaries ?? [];

  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Permanent player library</p><h2>Players</h2></section>
    {loading && <p className="card">Loading players…</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && activeData.players.length === 0 ? <p className="card">Players will appear once the player library has been seeded.</p> : <div className="player-grid">{activeData.players.map((player) => {
      const summary = summaries.find((row) => row.player.id === player.id);
      return <PlayerCard key={player.id} player={player} stats={toPlayerStats(summary)} toursAttended={summary?.toursAttended ?? 0} />;
    })}</div>}
  </div>;
}
