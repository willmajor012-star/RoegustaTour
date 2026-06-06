import { PlayerCard } from '../components/PlayerCard';
import { fetchPublicAdvancedStats } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { localAdvancedStatsFallback } from '../lib/localFallbackData';
import type { LeaderboardRow } from '../lib/types';

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
  const { data, loading, error, source } = usePublicData(fetchPublicAdvancedStats, {
    localFallback: localAdvancedStatsFallback,
    onErrorMessage: 'Live player data is unavailable, so local demo data is shown instead.',
  });
  const activeData = data ?? localAdvancedStatsFallback;
  const summaries = activeData.playerSummaries ?? [];

  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Permanent player library</p><h2>Players</h2></section>
    {loading && <p className="card">Loading players…</p>}
    {source === 'mock-fallback' && <p className="settled">Showing fallback demo data because live tour data is unavailable.</p>}
    {source === 'local-fallback' && <p className="settled">Showing fallback demo data because live tour data is unavailable.</p>}
    {error && <p className="card form-error">{error}</p>}
    {activeData.players.length === 0 ? <p className="card">Players will appear once the player library has been seeded.</p> : <div className="player-grid">{activeData.players.map((player) => {
      const summary = summaries.find((row) => row.player.id === player.id);
      return <PlayerCard key={player.id} player={player} stats={toPlayerStats(summary)} toursAttended={summary?.tourWins.length ?? 0} />;
    })}</div>}
  </div>;
}
