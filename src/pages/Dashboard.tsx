import { MatchCard } from '../components/MatchCard';
import { Scoreboard } from '../components/Scoreboard';
import { StatCard } from '../components/StatCard';
import { betMarkets, currentTourId, matchParticipants, matches, players, rounds, tourTeams, tours } from '../data/mockData';
import { calculateTeamScoreByTour } from '../lib/scoring';
import { formatShortDate } from '../lib/formatting';

export function Dashboard() {
  const tour = tours.find((item) => item.id === currentTourId)!;
  const tourRounds = rounds.filter((round) => round.tourId === currentTourId);
  const scores = calculateTeamScoreByTour(currentTourId, tourTeams, rounds, matches);
  const nextRound = tourRounds.find((round) => round.status !== 'complete');
  const todayMatches = matches.filter((match) => match.roundId === nextRound?.id).slice(0, 2);
  const recentResults = matches.filter((match) => match.tourId === currentTourId && match.status === 'complete').slice(0, 3);
  return <div className="page-stack"><section className="hero card"><p className="eyebrow">Current tour</p><h2>{tour.name}</h2><p>{tour.description}</p></section>
    <div className="stat-grid"><StatCard label="Next tee" value={nextRound?.teeTime ?? 'TBC'} detail={`${nextRound?.name} · ${formatShortDate(nextRound?.roundDate)}`} /><StatCard label="Open markets" value={betMarkets.filter((market) => market.status === 'open').length} detail="Visible betting log" /><StatCard label="Remaining points" value={matches.filter((match) => match.tourId === currentTourId && match.status !== 'complete').reduce((sum, match) => sum + match.pointsAvailable, 0)} detail="Still on the board" /></div>
    <section><h2>Team score</h2><Scoreboard scores={scores} rounds={tourRounds} /></section>
    <section><h2>Today’s matches</h2>{todayMatches.map((match) => <MatchCard key={match.id} match={match} participants={matchParticipants.filter((p) => p.matchId === match.id)} players={players} teams={tourTeams} />)}</section>
    <section><h2>Open betting markets</h2><div className="pill-row">{betMarkets.filter((market) => market.status === 'open').map((market) => <span className="pill" key={market.id}>{market.title}</span>)}</div></section>
    <section><h2>Recent results</h2>{recentResults.length === 0 && <p className="card">No 2026 results entered yet.</p>}{recentResults.map((match) => <MatchCard key={match.id} match={match} participants={matchParticipants.filter((p) => p.matchId === match.id)} players={players} teams={tourTeams} />)}</section>
    <section className="quick-links card"><h2>Quick links</h2><p>Use the bottom navigation for score, matches, stats, betting and info. Player profiles are available from Stats.</p></section>
  </div>;
}
