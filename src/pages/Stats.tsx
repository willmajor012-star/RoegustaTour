import { useMemo, useState } from 'react';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { currentTourId, historicalPlayerStats, matchParticipants, matches, players, rounds } from '../data/mockData';
import { formatMatchFormat, formatPercent, formatPoints } from '../lib/formatting';
import { derivePlayerMatchResultsFromMatch } from '../lib/scoring';
import { calculateAllTimePlayerStats, calculatePlayerStatsByFormat, calculatePlayerStatsByTour, normalizeHistoricalPlayerStats } from '../lib/stats';
import type { LeaderboardRow, MatchFormat } from '../lib/types';

const formatFilters: Array<{ value: MatchFormat; label: string }> = [
  { value: 'singles', label: 'Singles' },
  { value: 'better_ball', label: 'Better ball' },
  { value: 'scramble', label: 'Scramble' },
];

type View = 'current' | 'all' | MatchFormat;

function compactRecord(row?: LeaderboardRow) {
  if (!row) return '0-0-0';
  return `${row.wins}-${row.draws}-${row.losses}`;
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

export function Stats() {
  const [view, setView] = useState<View>('all');
  const rows = useMemo(() => view === 'current'
    ? calculatePlayerStatsByTour(currentTourId, players, matches, matchParticipants)
    : view === 'all'
      ? calculateAllTimePlayerStats(players, matches, matchParticipants, historicalPlayerStats)
      : calculatePlayerStatsByFormat(view, players, matches, matchParticipants), [view]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(rows[0]?.playerId);
  const selectedRow = rows.find((row) => row.playerId === selectedPlayerId) ?? rows[0];
  const selectedPlayer = players.find((player) => player.id === selectedRow?.playerId);
  const currentRow = selectedPlayer ? calculatePlayerStatsByTour(currentTourId, [selectedPlayer], matches, matchParticipants)[0] : undefined;
  const allTimeRow = selectedPlayer ? calculateAllTimePlayerStats([selectedPlayer], matches, matchParticipants, historicalPlayerStats)[0] : undefined;
  const formatRows = selectedPlayer ? formatFilters.map(({ value, label }) => ({ label, row: calculatePlayerStatsByFormat(value, [selectedPlayer], matches, matchParticipants)[0] })) : [];
  const history = selectedPlayer ? matches
    .flatMap((match) => derivePlayerMatchResultsFromMatch(match, matchParticipants.filter((participant) => participant.matchId === match.id)).filter((result) => result.playerId === selectedPlayer.id))
    .map((result) => ({ result, match: matches.find((match) => match.id === result.matchId), round: rounds.find((round) => round.id === result.roundId) }))
    .filter((item) => item.match)
    .slice(0, 8) : [];
  const historicSummary = selectedPlayer ? historicalPlayerStats.find((item) => item.playerId === selectedPlayer.id) : undefined;
  const normalizedHistoric = historicSummary ? normalizeHistoricalPlayerStats(historicSummary) : undefined;

  return (
    <div className="page-stack">
      <section className="page-title">
        <p className="eyebrow">Calculated leaderboards</p>
        <h2>Stats</h2>
        <p>Player profiles now live here. Current-tour rows are derived from completed results, with all-time records also including imported historic summaries.</p>
      </section>
      <div className="segmented">
        <button className={view === 'current' ? 'active' : ''} onClick={() => setView('current')}>Current tour</button>
        <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All-time</button>
        {formatFilters.map(({ value, label }) => <button className={view === value ? 'active' : ''} key={value} onClick={() => setView(value)}>{label}</button>)}
      </div>
      <section className="stats-layout">
        <div>
          <div className="stats-section-title"><h3>Leaderboard</h3><span>Tap a player for profile</span></div>
          <LeaderboardCards rows={rows} selectedPlayerId={selectedRow?.playerId} onSelect={setSelectedPlayerId} />
          <LeaderboardTable rows={rows} onSelectPlayer={setSelectedPlayerId} selectedPlayerId={selectedRow?.playerId} />
        </div>
        {selectedPlayer && (
          <aside className="player-profile card">
            <p className="eyebrow">Player profile</p>
            <h3>{selectedPlayer.displayName}</h3>
            <div className="profile-records">
              <div><span>Current tour</span><strong>{compactRecord(currentRow)}</strong><small>{formatPoints(currentRow?.points ?? 0)} pts · {formatPercent(currentRow?.winPercent ?? 0)}</small></div>
              <div><span>All-time</span><strong>{compactRecord(allTimeRow)}</strong><small>{formatPoints(allTimeRow?.points ?? 0)} pts · {formatPercent(allTimeRow?.winPercent ?? 0)}</small></div>
            </div>
            <div className="profile-table">
              <h4>Record detail</h4>
              <div className="mini-grid"><span>Matches</span><strong>{allTimeRow?.matches ?? 0}</strong><span>W</span><strong>{allTimeRow?.wins ?? 0}</strong><span>D</span><strong>{allTimeRow?.draws ?? 0}</strong><span>L</span><strong>{allTimeRow?.losses ?? 0}</strong><span>Points</span><strong>{formatPoints(allTimeRow?.points ?? 0)}</strong><span>Win %</span><strong>{formatPercent(allTimeRow?.winPercent ?? 0)}</strong></div>
            </div>
            <div>
              <h4>Stats by format</h4>
              <div className="format-stat-list">{formatRows.map(({ label, row }) => <span className="pill" key={label}>{label}: {compactRecord(row)} · {formatPoints(row?.points ?? 0)} pts</span>)}</div>
            </div>
            <div>
              <h4>Basic match history</h4>
              {history.length === 0 ? <p>No completed match history yet.</p> : history.map(({ result, match, round }) => <p key={result.id}><strong>{result.result.toUpperCase()}</strong> · {round?.name ?? 'Round'} · {match ? formatMatchFormat(match.format) : ''} · {formatPoints(result.pointsFor)}-{formatPoints(result.pointsAgainst)}</p>)}
              {normalizedHistoric && <p className="settled">Historic import: {normalizedHistoric.matches} matches, {formatPoints(normalizedHistoric.points)} points.</p>}
            </div>
          </aside>
        )}
      </section>
    </div>
  );
}
