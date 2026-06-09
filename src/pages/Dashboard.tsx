import { MatchCard } from '../components/MatchCard';
import { Scoreboard } from '../components/Scoreboard';
import { StatCard } from '../components/StatCard';
import { formatShortDate } from '../lib/formatting';
import { fetchPublicBetMarkets, fetchPublicMatches, fetchPublicScore, fetchPublicSummary, type PublicBetMarketsResponse, type PublicMatchesResponse, type PublicScoreResponse, type PublicSummaryResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

type DashboardData = {
  summary: Omit<PublicSummaryResponse, 'source'>;
  score: Omit<PublicScoreResponse, 'source'>;
  matches: Omit<PublicMatchesResponse, 'source'>;
  betting: Omit<PublicBetMarketsResponse, 'source'>;
  source: 'supabase';
};

const emptyDashboardData: DashboardData = {
  source: 'supabase',
  summary: { rounds: [], recentResults: [], openMarkets: [] },
  score: { teams: [], rounds: [], matches: [], scores: [] },
  matches: { rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [] },
  betting: { betMarkets: [], betOptions: [], bets: [] },
};

async function fetchDashboardData(): Promise<DashboardData> {
  const [summary, score, matches, betting] = await Promise.all([fetchPublicSummary(), fetchPublicScore(), fetchPublicMatches(), fetchPublicBetMarkets()]);
  return { summary, score, matches, betting, source: 'supabase' };
}

export function Dashboard() {
  const { data, loading, error } = usePublicData(fetchDashboardData);
  const activeData = data ?? emptyDashboardData;
  const tour = activeData.summary.tour ?? activeData.score.tour ?? activeData.matches.tour;
  const rounds = activeData.summary.rounds.length > 0 ? activeData.summary.rounds : activeData.score.rounds;
  const nextRound = rounds.find((round) => round.status !== 'complete');
  const upcomingMatches = activeData.matches.matches.filter((match) => match.status !== 'complete');
  const todayMatches = upcomingMatches.filter((match) => !nextRound || match.roundId === nextRound.id).slice(0, 2);
  const recentResults = activeData.matches.matches.filter((match) => match.status === 'complete').slice(0, 3);
  const publicRemainingPoints = upcomingMatches.reduce((sum, match) => sum + match.pointsAvailable, 0);
  const openMarkets = activeData.betting.betMarkets.filter((market) => market.status === 'open');

  return <div className="page-stack"><section className="hero card"><p className="eyebrow">Current tour</p><h2>{tour?.name ?? 'Roegusta Tour'}</h2>{tour?.location && <p>{tour.location}</p>}{tour?.description && <p>{tour.description}</p>}{!loading && !error && !tour && <p>No live data has been added yet.</p>}</section>
    {loading && <p className="card">Loading tour data…</p>}
    {error && <p className="card form-error">{error}</p>}
    <div className="stat-grid"><StatCard label="Next tee" value={nextRound?.teeTime ?? 'TBC'} detail={nextRound ? `${nextRound.name} · ${formatShortDate(nextRound.roundDate)}` : 'Next round TBC'} /><StatCard label="Open Bet Punto" value={openMarkets.length} detail="Visible Bet Punto log" /><StatCard label="Public remaining" value={publicRemainingPoints} detail="Published points still on the board" /></div>
    <section><h2>Team score</h2>{!loading && !error && activeData.score.scores.length === 0 ? <p className="card">Team score will build as results are entered.</p> : <Scoreboard scores={activeData.score.scores} rounds={activeData.score.rounds} />}</section>
    <section><h2>Today’s matches</h2>{!loading && !error && todayMatches.length === 0 && <p className="card">Matches will appear once captains publish the pairings.</p>}{todayMatches.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />)}</section>
    <section><h2>Open Bet Punto markets</h2>{!loading && !error && openMarkets.length === 0 ? <p className="card">Bet Punto markets will appear once they are added.</p> : <div className="pill-row">{openMarkets.map((market) => <span className="pill" key={market.id}>{market.title}</span>)}</div>}</section>
    <section><h2>Recent results</h2>{!loading && !error && recentResults.length === 0 && <p className="card">No results have been entered yet.</p>}{recentResults.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />)}</section>
    <section className="quick-links card"><h2>Quick links</h2><p>Use the bottom navigation for score, matches, players, stats, Bet Punto and info.</p></section>
  </div>;
}
