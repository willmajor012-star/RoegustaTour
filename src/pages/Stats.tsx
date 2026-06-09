import { useEffect, useMemo, useState } from 'react';
import { LeaderboardTable } from '../components/LeaderboardTable';
import {
  calculateMvpLeaderboard,
  calculatePlayerAdvancedSummaries,
  calculateTourSummary,
  getHeadToHead,
  type AdvancedStatsData,
  type HeadToHeadRecord,
  type MatchListItem,
  type MvpLeaderboardRow,
  type PartnerRecord,
  type PlayerAdvancedSummary,
  type RelationshipRanking,
  type TourSummary,
} from '../lib/advancedStats';
import { formatDate, formatMatchFormat, formatPercent, formatPoints } from '../lib/formatting';
import type { LeaderboardRow, Player, Tour } from '../lib/types';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';

type StatsSource = 'supabase';
type StatsTab = 'leaderboard' | 'mvp' | 'head-to-head' | 'players';
type PlayerSortOption = 'points-desc' | 'points-asc' | 'win-desc' | 'win-asc' | 'matches-desc' | 'matches-asc' | 'name-asc' | 'name-desc';

type StatsResponse = Omit<PublicAdvancedStatsResponse, 'source'> & { source: StatsSource };

const emptyStatsData: StatsResponse = { source: 'supabase', players: [], tours: [], tourTeams: [], tourPlayers: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };

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

function comparePlayerSummaries(a: PlayerAdvancedSummary, b: PlayerAdvancedSummary, sortBy: PlayerSortOption) {
  const nameCompare = a.player.displayName.localeCompare(b.player.displayName, undefined, { sensitivity: 'base' });
  switch (sortBy) {
    case 'points-asc':
      return a.totalPointsWon - b.totalPointsWon || nameCompare;
    case 'win-desc':
      return b.winPercent - a.winPercent || b.totalPointsWon - a.totalPointsWon || nameCompare;
    case 'win-asc':
      return a.winPercent - b.winPercent || b.totalPointsWon - a.totalPointsWon || nameCompare;
    case 'matches-desc':
      return b.allTimeRecord.matches - a.allTimeRecord.matches || b.totalPointsWon - a.totalPointsWon || nameCompare;
    case 'matches-asc':
      return a.allTimeRecord.matches - b.allTimeRecord.matches || b.totalPointsWon - a.totalPointsWon || nameCompare;
    case 'name-asc':
      return nameCompare;
    case 'name-desc':
      return -nameCompare;
    case 'points-desc':
    default:
      return b.totalPointsWon - a.totalPointsWon || b.winPercent - a.winPercent || nameCompare;
  }
}


function compactRecord(row?: Pick<LeaderboardRow, 'wins' | 'draws' | 'losses'>) {
  if (!row) return '0-0-0';
  return `${row.wins}-${row.draws}-${row.losses}`;
}

function advancedRecord(row?: { wins: number; draws: number; losses: number }) {
  if (!row) return '0-0-0';
  return `${row.wins}-${row.draws}-${row.losses}`;
}

function getCurrentTourId(stats: StatsResponse) {
  return stats.currentTour?.id ?? [...stats.tours].sort((a, b) => b.year - a.year)[0]?.id;
}

function normaliseStatsResponse(response: StatsResponse): StatsResponse {
  const data: AdvancedStatsData = {
    players: response.players ?? [],
    tours: response.tours ?? [],
    tourTeams: response.tourTeams ?? [],
    tourPlayers: response.tourPlayers ?? [],
    tourTeamMembers: response.tourTeamMembers ?? [],
    tourTeamResults: response.tourTeamResults ?? [],
    rounds: response.rounds ?? [],
    matches: response.matches ?? [],
    matchParticipants: response.matchParticipants ?? [],
    playerMatchResults: response.playerMatchResults ?? [],
  };
  const currentTour = response.currentTour ?? data.tours.find((tour) => tour.status === 'active') ?? [...data.tours].sort((a, b) => b.year - a.year)[0];
  const currentTourId = currentTour?.id;
  return {
    ...data,
    source: response.source,
    currentTour,
    tourSummary: response.tourSummary ?? calculateTourSummary(currentTourId, data),
    mvpLeaderboard: response.mvpLeaderboard ?? calculateMvpLeaderboard(currentTourId, data),
    playerSummaries: response.playerSummaries ?? calculatePlayerAdvancedSummaries(data, currentTourId),
  };
}

function toLeaderboardRows(summaries: PlayerAdvancedSummary[], key: 'allTimeRecord' | 'currentTourRecord'): LeaderboardRow[] {
  return summaries.map((summary) => ({
    playerId: summary.player.id,
    playerName: summary.player.displayName,
    matches: summary[key].matches,
    wins: summary[key].wins,
    draws: summary[key].draws,
    losses: summary[key].losses,
    points: summary[key].pointsWon,
    winPercent: summary[key].winPercent,
  })).filter((row) => row.matches > 0);
}

function LeaderboardCards({ rows, selectedPlayerId, onSelect }: { rows: LeaderboardRow[]; selectedPlayerId?: string; onSelect: (playerId: string) => void }) {
  return (
    <div className="leaderboard-cards">
      {rows.length === 0 ? <p className="card">No completed records yet for this view.</p> : rows.map((row, index) => (
        <button className={`leaderboard-card card ${selectedPlayerId === row.playerId ? 'selected' : ''}`} key={row.playerId} onClick={() => onSelect(row.playerId)}>
          <span className="rank">#{index + 1}</span>
          <span className="leaderboard-name">{row.playerName}</span>
          <strong>{formatPercent(row.winPercent)}</strong>
          <span>{formatPoints(row.points)} pts · {compactRecord(row)}</span>
        </button>
      ))}
    </div>
  );
}

function TourSummaryPanel({ summary }: { summary: TourSummary }) {
  const tour = summary.tour;

  return (
    <section className="card stats-panel">
      <div className="stats-section-title"><h3>Tour Summary</h3><span>{summary.totalMatchesCompleted} complete · {summary.remainingMatches} remaining</span></div>
      <p className="eyebrow">{tour?.name ?? 'Current tour'}</p>
      <p>{tour?.location ?? 'Location TBC'} · {formatDate(tour?.startDate)} – {formatDate(tour?.endDate)}</p>
      {summary.totalMatchesCompleted === 0 && <p className="settled">Tour summary will build as results are entered.</p>}
      <div className="stat-grid">
        {summary.summaryCards.map((card) => <div className="stat-card card" key={card.label}><span>{card.label}</span><strong>{card.value}</strong>{card.detail && <small>{card.detail}</small>}</div>)}
      </div>
      <div className="profile-records">
        <div><span>Team score</span><strong>{summary.teamScore.length ? summary.teamScore.map((row) => `${row.team.name} ${formatPoints(row.points)}`).join(' · ') : 'No score yet'}</strong></div>
        <div><span>Leading / winning team</span><strong>{summary.winningTeam?.name ?? summary.teamScore[0]?.team.name ?? 'TBC'}</strong></div>
        <div><span>Best singles</span><strong>{summary.bestSinglesPlayer?.player.displayName ?? 'TBC'}</strong><small>{summary.bestSinglesPlayer ? advancedRecord(summary.bestSinglesPlayer.currentTourSinglesRecord) : 'No singles completed'}</small></div>
        <div><span>Best team-format</span><strong>{summary.bestTeamFormatPlayer?.player.displayName ?? 'TBC'}</strong><small>{summary.bestTeamFormatPlayer ? advancedRecord(summary.bestTeamFormatPlayer.currentTourTeamFormatRecord) : 'No team matches completed'}</small></div>
      </div>
      <div>
        <h4>Unbeaten players</h4>
        {summary.unbeatenPlayers.length === 0 ? <p>No unbeaten records yet.</p> : <div className="chip-list">{summary.unbeatenPlayers.map((player) => <span className="pill" key={player.player.id}>{player.player.displayName} · {advancedRecord(player.currentTourRecord)}</span>)}</div>}
      </div>
    </section>
  );
}

function MvpSection({ rows }: { rows: MvpLeaderboardRow[] }) {
  return (
    <section className="stats-panel">
      <div className="stats-section-title"><h3>MVP leaderboard</h3><span>Matchplay-only v1 formula</span></div>
      <p className="settled">MVP is currently calculated from matchplay results only. Scorecard stats such as birdies, bogeys and stableford can be added later.</p>
      {rows.length === 0 ? <p className="card">MVP standings will appear once matches have been completed.</p> : (
        <div className="mvp-grid">
          {rows.map((row, index) => <MvpCard key={row.player.id} row={row} rank={index + 1} />)}
        </div>
      )}
    </section>
  );
}

function MvpCard({ row, rank }: { row: MvpLeaderboardRow; rank: number }) {
  return (
    <article className="card mvp-card">
      <span className="rank">#{rank}</span>
      <h3>{row.player.displayName}</h3>
      <strong>{formatPoints(row.mvpScore)} MVP</strong>
      <div className="mini-grid"><span>Points won</span><b>{formatPoints(row.pointsWon)}</b><span>Wins</span><b>{row.wins}</b><span>Singles wins</span><b>{row.singlesWins}</b><span>Unbeaten bonus</span><b>{formatPoints(row.unbeatenBonus)}</b><span>Winning-team bonus</span><b>{formatPoints(row.winningTeamBonus)}</b></div>
      <p>{row.explanation}</p>
    </article>
  );
}

function HeadToHeadSection({ players, data }: { players: Player[]; data: AdvancedStatsData }) {
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const samePlayer = playerAId && playerAId === playerBId;
  const result = playerAId && playerBId && !samePlayer ? getHeadToHead(playerAId, playerBId, data) : undefined;

  return (
    <section className="stats-panel">
      <div className="stats-section-title"><h3>Head-to-head</h3><span>Opponent, partner and singles records</span></div>
      <div className="head-to-head-selects card">
        <label>Player A<select value={playerAId} onChange={(event) => setPlayerAId(event.target.value)}><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label>
        <label>Player B<select value={playerBId} onChange={(event) => setPlayerBId(event.target.value)}><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id} disabled={player.id === playerAId}>{player.displayName}</option>)}</select></label>
      </div>
      {!playerAId || !playerBId ? <p className="card">Select two players to compare.</p> : samePlayer ? <p className="card form-error">Choose two different players to compare.</p> : result && (
        <div className="h2h-grid">
          <OpponentCard title="Opponent record" record={result.opponentRecord} aName={result.playerA?.displayName ?? 'Player A'} bName={result.playerB?.displayName ?? 'Player B'} emptyText="These players have not played against each other yet." />
          <PartnerCard record={result.partnerRecord} emptyText="These players have not partnered each other yet." />
          <OpponentCard title="Singles record" record={result.singlesRecord} aName={result.playerA?.displayName ?? 'Player A'} bName={result.playerB?.displayName ?? 'Player B'} emptyText="These players have not played a singles match against each other yet." />
          <div className="card h2h-match-list"><h4>Shared match list</h4>{result.allSharedMatches.length === 0 ? <p>No shared matches yet.</p> : result.allSharedMatches.map((item) => <MatchListLine item={item} key={item.match.id} />)}</div>
        </div>
      )}
    </section>
  );
}

function OpponentCard({ title, record, aName, bName, emptyText }: { title: string; record: HeadToHeadRecord; aName: string; bName: string; emptyText: string }) {
  return (
    <article className="card record-card">
      <h4>{title}</h4>
      {record.played === 0 ? <p>{emptyText}</p> : <><strong>{record.played} played</strong><p>{aName} {record.playerAWins} · {bName} {record.playerBWins} · Draws {record.draws}</p><p>Points: {formatPoints(record.playerAPoints)}–{formatPoints(record.playerBPoints)} · {aName} points % {formatPercent(record.played ? record.playerAPoints / record.played : 0)}</p></>}
    </article>
  );
}

function PartnerCard({ record, emptyText }: { record: PartnerRecord; emptyText: string }) {
  return (
    <article className="card record-card">
      <h4>Partner record</h4>
      {record.played === 0 ? <p>{emptyText}</p> : <><strong>{record.played} partnered</strong><p>{record.winsTogether} wins · {record.drawsTogether} draws · {record.lossesTogether} losses</p><p>Points together: {formatPoints(record.pointsWonTogether)}–{formatPoints(record.pointsAgainstTogether)} · {formatPercent(record.played ? record.pointsWonTogether / record.played : 0)}</p></>}
    </article>
  );
}

function MatchListLine({ item }: { item: MatchListItem }) {
  return <p><strong>{item.tour?.year ?? 'Tour'} · {item.round?.name ?? 'Round'}</strong><br />{formatMatchFormat(item.match.format)} · {item.sideAPlayers.map((player) => player.displayName).join(' / ') || item.match.sideALabel} vs {item.sideBPlayers.map((player) => player.displayName).join(' / ') || item.match.sideBLabel} · {item.resultText}</p>;
}

function PlayersSection({ selectedPlayerId, setSelectedPlayerId, summaries }: { selectedPlayerId?: string; setSelectedPlayerId: (playerId: string) => void; summaries: PlayerAdvancedSummary[] }) {
  const [sortBy, setSortBy] = useState<PlayerSortOption>('points-desc');
  const sortedSummaries = useMemo(() => [...summaries].sort((a, b) => comparePlayerSummaries(a, b, sortBy)), [sortBy, summaries]);

  return (
    <section className="stats-layout players-layout">
      <div>
        <div className="stats-section-title player-profiles-title">
          <div><h3>Player profiles</h3><span>Advanced matchplay drilldown</span></div>
          <label className="player-sort-control">
            <span>Sort players</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as PlayerSortOption)} disabled={summaries.length === 0}>
              {playerSortOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="leaderboard-cards player-card-list always-show">
          {sortedSummaries.length === 0 ? <p className="card">Player profiles will appear once matchplay results are available.</p> : sortedSummaries.map((summary) => {
            const isSelected = selectedPlayerId === summary.player.id;
            return (
              <div className={`player-card-row ${isSelected ? 'expanded' : ''}`} key={summary.player.id}>
                <button className={`leaderboard-card card ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedPlayerId(summary.player.id)}>
                  <span className="leaderboard-name">{summary.player.displayName}</span><strong>{formatPercent(summary.winPercent)}</strong><span>{formatPoints(summary.totalPointsWon)} pts · {advancedRecord(summary.allTimeRecord)}</span>
                </button>
                {isSelected && <PlayerProfile summary={summary} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PlayerProfile({ summary }: { summary: PlayerAdvancedSummary }) {
  return (
    <aside className="player-profile card">
      <p className="eyebrow">Player profile</p>
      <h3>{summary.player.displayName}</h3>
      <div className="profile-records">
        <RecordTile label="All-time" record={summary.allTimeRecord} />
        <RecordTile label="Current tour" record={summary.currentTourRecord} />
        <RecordTile label="Singles" record={summary.singlesRecord} />
        <RecordTile label="Team" record={summary.teamFormatRecord} />
        {/* Tour wins will return when historic winning-team membership data is complete. */}
      </div>
      <RelationshipList title="Best partners" rows={summary.bestPartners} />
      <RelationshipList title="Toughest opponents" rows={summary.toughestOpponents} />
      <RelationshipList title="Most common partners" rows={summary.mostCommonPartners} />
      <RelationshipList title="Most common opponents" rows={summary.mostCommonOpponents} />
      <details className="match-history-details">
        <summary>Recent matches</summary>
        <div className="match-history-list">
          {summary.matchHistory.length === 0 ? <p>No completed match history yet.</p> : summary.matchHistory.map((item) => <p key={item.result.id}><strong>{item.tour?.year} · {item.round?.name ?? 'Round'} · {item.result.result.toUpperCase()}</strong><br />{formatMatchFormat(item.match.format)} · Partners: {item.partners.map((player) => player.displayName).join(', ') || 'None'} · Opponents: {item.opponents.map((player) => player.displayName).join(', ') || 'TBC'} · {formatPoints(item.result.pointsFor)}-{formatPoints(item.result.pointsAgainst)}</p>)}
        </div>
      </details>
    </aside>
  );
}

function RecordTile({ label, record }: { label: string; record: { wins: number; draws: number; losses: number; pointsWon: number; winPercent: number } }) {
  return <div><span>{label}</span><strong>{advancedRecord(record)}</strong><small>{formatPoints(record.pointsWon)} pts · {formatPercent(record.winPercent)}</small></div>;
}

function RelationshipList({ title, rows }: { title: string; rows: RelationshipRanking[] }) {
  return <div><h4>{title}</h4>{rows.length === 0 ? <p>No records yet.</p> : <div className="format-stat-list">{rows.slice(0, 5).map((row) => <span className="pill" key={row.player.id}>{row.player.displayName}: {row.matches} match{row.matches === 1 ? '' : 'es'}, {formatPoints(row.pointsWon)} pts{row.lowSample ? ' · low sample' : ''}</span>)}</div>}</div>;
}

export function Stats() {
  const [tab, setTab] = useState<StatsTab>('leaderboard');
  const [stats, setStats] = useState<StatsResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      setLoading(true);
      setError(undefined);
      try {
        const payload = normaliseStatsResponse(await fetchPublicAdvancedStats() as StatsResponse);
        if (!cancelled) setStats(payload);
      } catch (caught) {
        console.error('Failed to load public advanced stats:', caught);
        if (!cancelled) {
          setError('Live tour data could not be loaded. Please refresh or try again later.');
          setStats(undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStats();
    return () => { cancelled = true; };
  }, []);

  const activeStats = stats ?? emptyStatsData;
  const currentTourId = getCurrentTourId(activeStats);
  const data = useMemo<AdvancedStatsData>(() => ({
    players: activeStats.players,
    tours: activeStats.tours,
    tourTeams: activeStats.tourTeams,
    tourPlayers: activeStats.tourPlayers ?? [],
    tourTeamMembers: activeStats.tourTeamMembers,
    tourTeamResults: activeStats.tourTeamResults,
    rounds: activeStats.rounds,
    matches: activeStats.matches,
    matchParticipants: activeStats.matchParticipants,
    playerMatchResults: activeStats.playerMatchResults,
  }), [activeStats]);
  const summaries = useMemo(() => activeStats.playerSummaries ?? calculatePlayerAdvancedSummaries(data, currentTourId), [activeStats.playerSummaries, currentTourId, data]);
  const mvpRows = useMemo(() => activeStats.mvpLeaderboard ?? calculateMvpLeaderboard(currentTourId, data), [activeStats.mvpLeaderboard, currentTourId, data]);
  const tourSummary = useMemo(() => activeStats.tourSummary ?? calculateTourSummary(currentTourId, data), [activeStats.tourSummary, currentTourId, data]);
  const allTimeRows = useMemo(() => toLeaderboardRows(summaries, 'allTimeRecord'), [summaries]);
  const currentRows = useMemo(() => toLeaderboardRows(summaries, 'currentTourRecord'), [summaries]);

  useEffect(() => {
    if (selectedPlayerId && !summaries.some((summary) => summary.player.id === selectedPlayerId)) setSelectedPlayerId(undefined);
  }, [selectedPlayerId, summaries]);

  return (
    <div className="page-stack">
      <section className="page-title">
        <p className="eyebrow">Core Stats Intelligence</p>
        <h2>Stats</h2>
        <p>Matchplay-derived leaderboards, MVP standings, head-to-head comparison and player profiles. Scorecard, birdie, bogey, stableford and Golf GameBook data are intentionally not included yet.</p>
      </section>
      {loading && <p className="card">Loading live stats…</p>}
      {error && <p className="card form-error">{error}</p>}
      <div className="segmented">
        <button className={tab === 'leaderboard' ? 'active' : ''} onClick={() => setTab('leaderboard')}>Leaderboard</button>
        <button className={tab === 'mvp' ? 'active' : ''} onClick={() => setTab('mvp')}>MVP</button>
        <button className={tab === 'head-to-head' ? 'active' : ''} onClick={() => setTab('head-to-head')}>Head-to-head</button>
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>Players</button>
      </div>
      {tab === 'leaderboard' && <section className="stats-panel"><TourSummaryPanel summary={tourSummary} /><div className="stats-section-title"><h3>All-time leaderboard</h3><span>Match-level all-time rows</span></div><LeaderboardCards rows={allTimeRows} selectedPlayerId={selectedPlayerId} onSelect={setSelectedPlayerId} /><LeaderboardTable rows={allTimeRows} selectedPlayerId={selectedPlayerId} onSelectPlayer={setSelectedPlayerId} />{currentRows.length > 0 && <><div className="stats-section-title"><h3>Current tour leaderboard</h3><span>Completed matches only</span></div><LeaderboardCards rows={currentRows} selectedPlayerId={selectedPlayerId} onSelect={setSelectedPlayerId} /><LeaderboardTable rows={currentRows} selectedPlayerId={selectedPlayerId} onSelectPlayer={setSelectedPlayerId} /></>}</section>}
      {tab === 'mvp' && <MvpSection rows={mvpRows} />}
      {tab === 'head-to-head' && <HeadToHeadSection players={activeStats.players} data={data} />}
      {tab === 'players' && <PlayersSection selectedPlayerId={selectedPlayerId} setSelectedPlayerId={setSelectedPlayerId} summaries={summaries} />}
    </div>
  );
}
