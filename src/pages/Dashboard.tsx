import { MatchCard } from '../components/MatchCard';
import { Scoreboard } from '../components/Scoreboard';
import { StatCard } from '../components/StatCard';
import { formatDate, formatPoints, formatShortDate } from '../lib/formatting';
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
  const nextTeeMatch = upcomingMatches.find((match) => !nextRound || match.roundId === nextRound.id);
  const recentResults = activeData.matches.matches.filter((match) => match.status === 'complete').slice(0, 3);
  const publicRemainingPoints = upcomingMatches.reduce((sum, match) => sum + match.pointsAvailable, 0);
  const openMarkets = activeData.betting.betMarkets.filter((market) => market.status === 'open');
  const leader = activeData.score.scores[0];
  const tied = activeData.score.scores.length > 1 && activeData.score.scores[0]?.points === activeData.score.scores[1]?.points;

  return <div className="page-stack overview-page">
    <section className="tour-landing-card card">
      <div>
        <p className="eyebrow">Current tour</p>
        <h2>{tour?.name ?? 'Roegusta Tour'}</h2>
        <p>{tour?.location ?? 'Location TBC'} · {formatDate(tour?.startDate)} — {formatDate(tour?.endDate)}</p>
        {tour?.description && <p>{tour.description}</p>}
        {!loading && !error && !tour && <p>No live data has been added yet.</p>}
      </div>
      <img src="/brand/roegusta-logo-landscape.png" alt="Roegusta Tour" />
    </section>
    {loading && <p className="card">Loading tour data…</p>}
    {error && <p className="card form-error">{error}</p>}
    <section className="overview-highlight-grid">
      <a className="score-feature card tappable-card" href="/matches">
        <div className="section-heading"><div><p className="eyebrow">Team score</p><h2>{leader ? tied ? 'All square' : `${leader.teamName} lead` : 'Score pending'}</h2></div>{leader && <strong>{formatPoints(leader.points)} pts</strong>}<span className="card-chevron" aria-hidden="true">›</span></div>
        {activeData.score.scores.length === 0 ? <p>Team score will build as results are entered.</p> : <Scoreboard scores={activeData.score.scores} rounds={activeData.score.rounds} />}
      </a>
      <a className="next-tee-card card tappable-card" href="/matches">
        <p className="eyebrow">Next round / next tee</p>
        <h3>{nextRound?.name ?? 'Next round TBC'}</h3>
        <p>{nextRound?.courseName ?? 'Course TBC'}</p>
        <div className="tee-time-lockup"><strong>{nextTeeMatch?.teeTime ?? nextRound?.teeTime ?? 'TBC'}</strong><span>{formatShortDate(nextRound?.roundDate)}</span><span className="card-chevron" aria-hidden="true">›</span></div>
      </a>
    </section>
    <div className="stat-grid">
      <StatCard href="/matches" label="Remaining points" value={formatPoints(publicRemainingPoints)} detail="Published points still on the board" />
      <StatCard href="/betting" label="Open Bet Punto" value={openMarkets.length} detail="Live public markets" />
      <StatCard href="/players" label="Players" value={activeData.matches.players.length} detail="Published player list" />
      <StatCard href="/teams" label="Teams" value={activeData.matches.tourTeams.length} detail="Current tour squads" />
    </div>
    <a className="card market-preview tappable-card" href="/betting"><div className="section-heading"><div><p className="eyebrow">Bet Punto</p><h2>Open markets</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>{!loading && !error && openMarkets.length === 0 ? <p>Bet Punto markets will appear once they are added.</p> : <div className="premium-list">{openMarkets.slice(0, 4).map((market) => <div className="premium-list-row" key={market.id}><strong>{market.title}</strong><span>{market.marketType.replace('_', ' ')}</span></div>)}</div>}</a>
    <section><div className="section-heading"><div><p className="eyebrow">Latest</p><h2>Recent results</h2></div><a className="text-link" href="/matches">All results ›</a></div>{!loading && !error && recentResults.length === 0 && <p className="card">No results have been entered yet.</p>}{recentResults.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />)}</section>
    <a className="handbook-link card tappable-card" href="/info"><div><p className="eyebrow">Handbook</p><strong>Tour details, itinerary, kit and rules</strong></div><span className="card-chevron" aria-hidden="true">›</span></a>
  </div>;
}
