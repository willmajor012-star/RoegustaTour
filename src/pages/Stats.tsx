import { useEffect, useMemo, useState } from 'react';
import { LeaderboardTable } from '../components/LeaderboardTable';
import {
  calculatePlayerAdvancedSummaries,
  getHeadToHead,
  type AdvancedStatsData,
  type HeadToHeadRecord,
  type MatchListItem,
  type PartnerRecord,
  type PlayerAdvancedSummary,
  type RelationshipRanking,
} from '../lib/advancedStats';
import { formatMatchFormat, formatPercent, formatPoints } from '../lib/formatting';
import { formatMatchDisplayLabel, formatRoundDisplayName, formatTourDisplayName } from '../lib/display';
import type { LeaderboardRow, Player, Tour } from '../lib/types';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';

type StatsSource = 'supabase';
type StatsView = 'current' | 'previous' | 'total' | 'h2h';
type PlayerSortOption = 'points-desc' | 'win-desc' | 'matches-desc' | 'name-asc';
type StatsResponse = Omit<PublicAdvancedStatsResponse, 'source'> & { source: StatsSource };

const emptyStatsData: StatsResponse = { source: 'supabase', players: [], tours: [], tourTeams: [], tourPlayers: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };
const playerSortOptions: { value: PlayerSortOption; label: string }[] = [
  { value: 'points-desc', label: 'Points' },
  { value: 'win-desc', label: 'Win %' },
  { value: 'matches-desc', label: 'Matches' },
  { value: 'name-asc', label: 'A–Z' },
];

function comparePlayerSummaries(a: PlayerAdvancedSummary, b: PlayerAdvancedSummary, sortBy: PlayerSortOption) {
  const nameCompare = a.player.displayName.localeCompare(b.player.displayName, undefined, { sensitivity: 'base' });
  if (sortBy === 'win-desc') return b.winPercent - a.winPercent || b.totalPointsWon - a.totalPointsWon || nameCompare;
  if (sortBy === 'matches-desc') return b.allTimeRecord.matches - a.allTimeRecord.matches || b.totalPointsWon - a.totalPointsWon || nameCompare;
  if (sortBy === 'name-asc') return nameCompare;
  return b.totalPointsWon - a.totalPointsWon || b.winPercent - a.winPercent || nameCompare;
}

function recordText(row?: { wins: number; draws: number; losses: number }) {
  if (!row) return '0-0-0';
  return `${row.wins}-${row.draws}-${row.losses}`;
}

function getCurrentTour(stats: StatsResponse) {
  return stats.currentTour ?? stats.tours.find((tour) => tour.status === 'active') ?? [...stats.tours].sort((a, b) => b.year - a.year)[0];
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
  return { ...data, source: response.source, currentTour, playerSummaries: response.playerSummaries ?? calculatePlayerAdvancedSummaries(data, currentTour?.id) };
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
  })).filter((row) => row.matches > 0).sort((a, b) => b.points - a.points || b.winPercent - a.winPercent || a.playerName.localeCompare(b.playerName, undefined, { sensitivity: 'base' }));
}

function HeadToHeadSection({ players, data }: { players: Player[]; data: AdvancedStatsData }) {
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const samePlayer = playerAId && playerAId === playerBId;
  const result = playerAId && playerBId && !samePlayer ? getHeadToHead(playerAId, playerBId, data) : undefined;

  return <section className="stats-panel">
    <div className="stats-section-title"><h3>Head-to-head</h3></div>
    <div className="head-to-head-selects card">
      <label>Player A<select value={playerAId} onChange={(event) => setPlayerAId(event.target.value)}><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label>
      <label>Player B<select value={playerBId} onChange={(event) => setPlayerBId(event.target.value)}><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id} disabled={player.id === playerAId}>{player.displayName}</option>)}</select></label>
    </div>
    {!playerAId || !playerBId ? <p className="card">Select two players to compare.</p> : samePlayer ? <p className="card form-error">Choose two different players.</p> : result && <div className="h2h-grid">
      <OpponentCard title="Record" record={result.opponentRecord} aName={result.playerA?.displayName ?? 'Player A'} bName={result.playerB?.displayName ?? 'Player B'} emptyText="No head-to-head matches yet." />
      <PartnerCard record={result.partnerRecord} emptyText="No partner matches yet." />
      <OpponentCard title="Singles" record={result.singlesRecord} aName={result.playerA?.displayName ?? 'Player A'} bName={result.playerB?.displayName ?? 'Player B'} emptyText="No singles matches yet." />
      <div className="card h2h-match-list"><h4>Shared matches</h4>{result.allSharedMatches.length === 0 ? <p>No shared matches yet.</p> : result.allSharedMatches.map((item) => <MatchListLine item={item} key={item.match.id} />)}</div>
    </div>}
  </section>;
}

function OpponentCard({ title, record, aName, bName, emptyText }: { title: string; record: HeadToHeadRecord; aName: string; bName: string; emptyText: string }) {
  return <article className="card record-card"><h4>{title}</h4>{record.played === 0 ? <p>{emptyText}</p> : <><strong>{record.played} played</strong><p>{aName} {record.playerAWins} · {bName} {record.playerBWins} · Draws {record.draws}</p><p>Points {formatPoints(record.playerAPoints)}–{formatPoints(record.playerBPoints)}</p></>}</article>;
}

function PartnerCard({ record, emptyText }: { record: PartnerRecord; emptyText: string }) {
  return <article className="card record-card"><h4>Partner</h4>{record.played === 0 ? <p>{emptyText}</p> : <><strong>{record.played} played</strong><p>{record.winsTogether}-{record.drawsTogether}-{record.lossesTogether}</p><p>Points {formatPoints(record.pointsWonTogether)}–{formatPoints(record.pointsAgainstTogether)}</p></>}</article>;
}

function MatchListLine({ item }: { item: MatchListItem }) {
  return <p><strong>{formatMatchDisplayLabel(item.match, item.round)}</strong><br />{item.sideAPlayers.map((player) => player.displayName).join(' / ') || item.match.sideALabel || 'Team 1'} vs {item.sideBPlayers.map((player) => player.displayName).join(' / ') || item.match.sideBLabel || 'Team 2'} · {item.resultText}</p>;
}

function LeaderboardCards({ rows, selectedPlayerId, onSelect }: { rows: LeaderboardRow[]; selectedPlayerId?: string; onSelect: (playerId: string) => void }) {
  return <div className="leaderboard-cards">{rows.length === 0 ? <p className="card">No results yet.</p> : rows.map((row, index) => <button className={`leaderboard-card card ${selectedPlayerId === row.playerId ? 'selected' : ''}`} key={row.playerId} onClick={() => onSelect(selectedPlayerId === row.playerId ? '' : row.playerId)}><span className="rank">#{index + 1}</span><span className="leaderboard-name">{row.playerName}</span><strong>{formatPoints(row.points)} pts</strong><span>{recordText(row)} · {formatPercent(row.winPercent)}</span></button>)}</div>;
}

function PlayersSection({ selectedPlayerId, setSelectedPlayerId, summaries, emptyText }: { selectedPlayerId?: string; setSelectedPlayerId: (playerId: string | undefined) => void; summaries: PlayerAdvancedSummary[]; emptyText: string }) {
  const [sortBy, setSortBy] = useState<PlayerSortOption>('points-desc');
  const sortedSummaries = useMemo(() => [...summaries].sort((a, b) => comparePlayerSummaries(a, b, sortBy)), [sortBy, summaries]);
  return <section className="stats-layout players-layout"><div className="stats-section-title player-profiles-title"><div><h3>Players</h3></div><label className="player-sort-control"><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as PlayerSortOption)}>{playerSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="leaderboard-cards player-card-list always-show">{sortedSummaries.length === 0 ? <p className="card">{emptyText}</p> : sortedSummaries.map((summary) => {
    const isSelected = selectedPlayerId === summary.player.id;
    return <div className={`player-card-row ${isSelected ? 'expanded' : ''}`} key={summary.player.id}><button className={`leaderboard-card card ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedPlayerId(isSelected ? undefined : summary.player.id)}><span className="leaderboard-name">{summary.player.displayName}</span><strong>{formatPoints(summary.totalPointsWon)} pts</strong><span>{recordText(summary.allTimeRecord)} · {formatPercent(summary.winPercent)}</span></button>{isSelected && <PlayerProfile summary={summary} />}</div>;
  })}</div></section>;
}

function PlayerProfile({ summary }: { summary: PlayerAdvancedSummary }) {
  return <aside className="player-profile card"><h3>{summary.player.displayName}</h3><div className="profile-records"><RecordTile label="All-time" record={summary.allTimeRecord} /><RecordTile label="Current tour" record={summary.currentTourRecord} /><RecordTile label="Singles" record={summary.singlesRecord} /><RecordTile label="Team" record={summary.teamFormatRecord} /></div><details><summary>Partners and opponents</summary><RelationshipList title="Best partners" rows={summary.bestPartners} /><RelationshipList title="Toughest opponents" rows={summary.toughestOpponents} /></details><details className="match-history-details"><summary>Recent matches</summary><div className="match-history-list">{summary.matchHistory.length === 0 ? <p>No completed match history yet.</p> : summary.matchHistory.map((item) => <p key={item.result.id}><strong>{formatMatchDisplayLabel(item.match, item.round)} · {item.result.result.toUpperCase()}</strong><br />{item.partners.length > 0 && <>Partners: {item.partners.map((player) => player.displayName).join(', ')} · </>}Opponents: {item.opponents.map((player) => player.displayName).join(', ') || 'TBC'} · {formatPoints(item.result.pointsFor)}-{formatPoints(item.result.pointsAgainst)}</p>)}</div></details></aside>;
}

function RecordTile({ label, record }: { label: string; record: { wins: number; draws: number; losses: number; pointsWon: number; winPercent: number } }) {
  return <div><span>{label}</span><strong>{recordText(record)}</strong><small>{formatPoints(record.pointsWon)} pts · {formatPercent(record.winPercent)}</small></div>;
}

function RelationshipList({ title, rows }: { title: string; rows: RelationshipRanking[] }) {
  const meaningful = rows.filter((row) => row.matches > 0).slice(0, 5);
  if (meaningful.length === 0) return null;
  return <div><h4>{title}</h4><div className="format-stat-list">{meaningful.map((row) => <span className="pill" key={row.player.id}>{row.player.displayName}: {row.matches} match{row.matches === 1 ? '' : 'es'}, {formatPoints(row.pointsWon)} pts</span>)}</div></div>;
}

function scoreForTour(stats: StatsResponse, tour?: Tour) {
  if (!tour) return 'Final score TBC';
  const teams = stats.tourTeams.filter((team) => team.tourId === tour.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const scoreMap = new Map(teams.map((team) => [team.id, 0]));
  stats.matches.filter((match) => match.tourId === tour.id && match.status === 'complete').forEach((match) => {
    scoreMap.set(match.sideATeamId, (scoreMap.get(match.sideATeamId) ?? 0) + (match.pointsSideA ?? 0));
    scoreMap.set(match.sideBTeamId, (scoreMap.get(match.sideBTeamId) ?? 0) + (match.pointsSideB ?? 0));
  });
  const rows = teams.map((team) => `${team.name} ${formatPoints(scoreMap.get(team.id) ?? 0)}`);
  return rows.length > 0 ? rows.join(' · ') : 'Final score TBC';
}

export function Stats() {
  const [stats, setStats] = useState<StatsResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>();
  const [view, setView] = useState<StatsView>('current');
  const [selectedTourId, setSelectedTourId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      setLoading(true);
      setError(undefined);
      try {
        const payload = normaliseStatsResponse(await fetchPublicAdvancedStats() as StatsResponse);
        if (!cancelled) setStats(payload);
      } catch (caught) {
        console.error('Stats load failed:', caught);
        if (!cancelled) {
          setError('Stats could not be loaded. Please refresh.');
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
  const currentTour = getCurrentTour(activeStats);
  const previousTours = [...activeStats.tours].filter((tour) => tour.id !== currentTour?.id).sort((a, b) => b.year - a.year);
  const selectedTour = previousTours.find((tour) => tour.id === selectedTourId) ?? previousTours[0];
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
    playerMatchResults: activeStats.playerMatchResults ?? [],
  }), [activeStats]);
  const currentSummaries = useMemo(() => calculatePlayerAdvancedSummaries(data, currentTour?.id), [data, currentTour?.id]);
  const previousSummaries = useMemo(() => selectedTour ? calculatePlayerAdvancedSummaries(data, selectedTour.id) : [], [data, selectedTour]);
  const allSummaries = useMemo(() => activeStats.playerSummaries ?? calculatePlayerAdvancedSummaries(data, currentTour?.id), [activeStats.playerSummaries, currentTour?.id, data]);
  const currentLeaderboard = useMemo(() => toLeaderboardRows(currentSummaries, 'currentTourRecord'), [currentSummaries]);
  const previousLeaderboard = useMemo(() => toLeaderboardRows(previousSummaries, 'currentTourRecord'), [previousSummaries]);
  const allLeaderboard = useMemo(() => toLeaderboardRows(allSummaries, 'allTimeRecord'), [allSummaries]);

  useEffect(() => { setSelectedPlayerId(undefined); }, [view, selectedTourId]);

  return <div className="page-stack stats-page"><section className="page-title"><h2>Stats</h2></section>{loading && <p className="card">Loading stats…</p>}{error && <p className="card form-error">{error}</p>}
    <div className="segmented stats-switch" role="tablist" aria-label="Stats views">{[
      ['current', 'Current tour'], ['previous', 'Previous tours'], ['total', 'Total points'], ['h2h', 'Head-to-head'],
    ].map(([value, label]) => <button key={value} className={view === value ? 'active' : ''} onClick={() => setView(value as StatsView)}>{label}</button>)}</div>

    {view === 'current' && <><section className="stats-panel"><div className="stats-section-title"><h3>Leaderboard</h3><span>{currentTour ? formatTourDisplayName(currentTour) : 'Current tour'}</span></div>{currentLeaderboard.length === 0 ? <p className="card">Current tour stats will appear once results are entered.</p> : <><LeaderboardCards rows={currentLeaderboard} selectedPlayerId={selectedPlayerId} onSelect={(id) => setSelectedPlayerId(id || undefined)} /><LeaderboardTable rows={currentLeaderboard} selectedPlayerId={selectedPlayerId} onSelectPlayer={(id) => setSelectedPlayerId(selectedPlayerId === id ? undefined : id)} /></>}</section><PlayersSection selectedPlayerId={selectedPlayerId} setSelectedPlayerId={setSelectedPlayerId} summaries={currentSummaries.filter((summary) => summary.currentTourRecord.matches > 0)} emptyText="Current tour stats will appear once results are entered." /></>}

    {view === 'previous' && <><section className="stats-panel"><div className="stats-section-title"><h3>Previous tours</h3><span><a href="/tours">Tours</a></span></div>{previousTours.length === 0 ? <p className="card">Previous tours will appear here once available.</p> : <div className="filters card"><label><span>Tour</span><select value={selectedTour?.id ?? ''} onChange={(event) => setSelectedTourId(event.target.value)}>{previousTours.map((tour) => <option key={tour.id} value={tour.id}>{formatTourDisplayName(tour)}</option>)}</select></label></div>}{selectedTour && <p className="card tour-score-line">{scoreForTour(activeStats, selectedTour)}</p>}{previousLeaderboard.length > 0 ? <LeaderboardTable rows={previousLeaderboard} /> : selectedTour && <p className="card">No leaderboard yet.</p>}</section>{selectedTour && <PlayersSection selectedPlayerId={selectedPlayerId} setSelectedPlayerId={setSelectedPlayerId} summaries={previousSummaries.filter((summary) => summary.currentTourRecord.matches > 0)} emptyText="No player records yet." />}</>}

    {view === 'total' && <><section className="stats-panel"><div className="stats-section-title"><h3>Total points</h3></div><LeaderboardCards rows={allLeaderboard} selectedPlayerId={selectedPlayerId} onSelect={(id) => setSelectedPlayerId(id || undefined)} /><LeaderboardTable rows={allLeaderboard} selectedPlayerId={selectedPlayerId} onSelectPlayer={(id) => setSelectedPlayerId(selectedPlayerId === id ? undefined : id)} /></section><PlayersSection selectedPlayerId={selectedPlayerId} setSelectedPlayerId={setSelectedPlayerId} summaries={allSummaries} emptyText="No completed records yet." /></>}

    {view === 'h2h' && <HeadToHeadSection players={activeStats.players} data={data} />}
  </div>;
}
