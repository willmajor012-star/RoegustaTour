import { useState } from 'react';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { currentTourId, historicalPlayerStats, matchParticipants, matches, players } from '../data/mockData';
import { calculateAllTimePlayerStats, calculatePlayerStatsByFormat, calculatePlayerStatsByTour } from '../lib/stats';
import type { MatchFormat } from '../lib/types';

export function Stats() {
  const [view, setView] = useState<'current' | 'all' | MatchFormat>('current');
  const rows = view === 'current' ? calculatePlayerStatsByTour(currentTourId, players, matches, matchParticipants) : view === 'all' ? calculateAllTimePlayerStats(players, matches, matchParticipants, historicalPlayerStats) : calculatePlayerStatsByFormat(view, players, matches, matchParticipants);
  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Calculated leaderboards</p><h2>Stats</h2><p>All current-tour rows are derived from completed match results. All-time also includes imported historic summaries.</p></section><div className="segmented"><button className={view === 'current' ? 'active' : ''} onClick={() => setView('current')}>Current tour</button><button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All-time</button><button onClick={() => setView('singles')}>Singles</button><button onClick={() => setView('better_ball')}>Better ball</button><button onClick={() => setView('scramble')}>Scramble</button></div><LeaderboardTable rows={rows} /></div>;
}
