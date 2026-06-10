import { useMemo, useState } from 'react';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { formatMatchFormat, formatPercent, formatPoints } from '../lib/formatting';
import { getPlayerInitials } from '../lib/people';
import type { LeaderboardRow } from '../lib/types';

type PlayerSortOption = 'points-desc' | 'points-asc' | 'win-desc' | 'win-asc' | 'matches-desc' | 'matches-asc' | 'name-asc' | 'name-desc';

const emptyAdvancedStats: Omit<PublicAdvancedStatsResponse, 'source'> = { players: [], tours: [], tourTeams: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };
const playerSortOptions: { value: PlayerSortOption; label: string }[] = [
  { value: 'points-desc', label: 'Points high to low' },
  { value: 'points-asc', label: 'Points low to high' },
  { value: 'win-desc', label: 'Win % high to low' },
  { value: 'win-asc', label: 'Win % low to high' },
  { value: 'matches-desc', label: 'Matches high to low' },
  { value: 'matches-asc', label: 'Matches low to high' },
  { value: 'name-asc', label: 'A–Z' },
  { value: 'name-desc', label: 'Z–A' },
];

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

function compareRows(a: LeaderboardRow, b: LeaderboardRow, sortBy: PlayerSortOption) {
  const nameCompare = a.playerName.localeCompare(b.playerName, undefined, { sensitivity: 'base' });
  switch (sortBy) {
    case 'points-asc': return a.points - b.points || nameCompare;
    case 'win-desc': return b.winPercent - a.winPercent || b.points - a.points || nameCompare;
    case 'win-asc': return a.winPercent - b.winPercent || b.points - a.points || nameCompare;
    case 'matches-desc': return b.matches - a.matches || b.points - a.points || nameCompare;
    case 'matches-asc': return a.matches - b.matches || b.points - a.points || nameCompare;
    case 'name-asc': return nameCompare;
    case 'name-desc': return -nameCompare;
    default: return b.points - a.points || b.winPercent - a.winPercent || nameCompare;
  }
}

export function Players() {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>();
  const [sortBy, setSortBy] = useState<PlayerSortOption>('points-desc');
  const { data, loading, error } = usePublicData(fetchPublicAdvancedStats);
  const activeData = data ?? emptyAdvancedStats;
  const summaries = activeData.playerSummaries ?? [];
  const rows = useMemo(() => activeData.players.map((player) => {
    const summary = summaries.find((item) => item.player.id === player.id);
    return { player, summary, stats: toPlayerStats(summary) ?? { playerId: player.id, playerName: player.displayName, matches: 0, wins: 0, draws: 0, losses: 0, points: 0, winPercent: 0 } };
  }).sort((a, b) => compareRows(a.stats, b.stats, sortBy)), [activeData.players, sortBy, summaries]);

  return <div className="page-stack players-page"><section className="page-title premium-title"><p className="eyebrow">Player profiles</p><h2>Players</h2><p>Initials-only player cards with matchplay stats, inline mobile expansion and recent matches collapsed by default.</p></section>
    {loading && <p className="card">Loading players…</p>}
    {error && <p className="card form-error">{error}</p>}
    <label className="player-sort-control card"><span>Sort players</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as PlayerSortOption)} disabled={rows.length === 0}>{playerSortOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    {!loading && !error && rows.length === 0 ? <p className="card">Players will appear once the player library has been seeded.</p> : <div className="leaderboard-cards player-card-list always-show">{rows.map(({ player, summary, stats }) => {
      const isSelected = selectedPlayerId === player.id;
      return <div className={`player-card-row ${isSelected ? 'expanded' : ''}`} key={player.id}>
        <button className={`leaderboard-card card ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedPlayerId(isSelected ? undefined : player.id)}>
          <span className="avatar">{getPlayerInitials(player)}</span><span className="leaderboard-name">{player.displayName}</span><strong>{formatPercent(stats.winPercent)}</strong><span>{formatPoints(stats.points)} pts · {stats.wins}-{stats.draws}-{stats.losses} · {stats.matches} matches</span>
        </button>
        {isSelected && <aside className="player-profile card"><p className="eyebrow">Profile</p><h3>{player.displayName}</h3>{player.nickname && <p>“{player.nickname}”</p>}<div className="profile-records"><RecordTile label="All-time" stats={stats} /><RecordTile label="Current tour" stats={summary ? { ...stats, wins: summary.currentTourRecord.wins, draws: summary.currentTourRecord.draws, losses: summary.currentTourRecord.losses, points: summary.currentTourRecord.pointsWon, winPercent: summary.currentTourRecord.winPercent } : stats} /><RecordTile label="Singles" stats={summary ? { ...stats, wins: summary.singlesRecord.wins, draws: summary.singlesRecord.draws, losses: summary.singlesRecord.losses, points: summary.singlesRecord.pointsWon, winPercent: summary.singlesRecord.winPercent } : stats} /></div><details className="match-history-details"><summary>Recent matches</summary><div className="match-history-list">{!summary || summary.matchHistory.length === 0 ? <p>No completed match history yet.</p> : summary.matchHistory.map((item) => <p key={item.result.id}><strong>{item.tour?.year} · {item.round?.name ?? 'Round'} · {item.result.result.toUpperCase()}</strong><br />{formatMatchFormat(item.match.format)} · Partners: {item.partners.map((partner) => partner.displayName).join(', ') || 'None'} · Opponents: {item.opponents.map((opponent) => opponent.displayName).join(', ') || 'TBC'} · {formatPoints(item.result.pointsFor)}-{formatPoints(item.result.pointsAgainst)}</p>)}</div></details></aside>}
      </div>;
    })}</div>}
  </div>;
}

function RecordTile({ label, stats }: { label: string; stats: Pick<LeaderboardRow, 'wins' | 'draws' | 'losses' | 'points' | 'winPercent'> }) {
  return <div><span>{label}</span><strong>{stats.wins}-{stats.draws}-{stats.losses}</strong><small>{formatPoints(stats.points)} pts · {formatPercent(stats.winPercent)}</small></div>;
}
