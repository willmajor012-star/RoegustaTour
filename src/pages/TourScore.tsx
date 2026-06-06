import { Scoreboard } from '../components/Scoreboard';
import { currentTourId, matches, rounds, tourTeams, tours } from '../data/mockData';
import { calculateTeamScoreByTour } from '../lib/scoring';
import { formatPoints } from '../lib/formatting';

export function TourScore() {
  const tour = tours.find((item) => item.id === currentTourId)!;
  const tourRounds = rounds.filter((round) => round.tourId === currentTourId);
  const tourMatches = matches.filter((match) => match.tourId === currentTourId);
  const scores = calculateTeamScoreByTour(currentTourId, tourTeams, rounds, matches);
  const remaining = tourMatches.filter((match) => match.status !== 'complete').reduce((sum, match) => sum + match.pointsAvailable, 0);
  const leader = scores[0];
  const tied = scores.length > 1 && scores[0].points === scores[1].points;
  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Ryder Cup-style score</p><h2>{tour.name}</h2></section><Scoreboard scores={scores} rounds={tourRounds} />
    <div className="stat-grid"><StatCardShim label="Completed" value={tourMatches.filter((match) => match.status === 'complete').length} /><StatCardShim label="Remaining" value={formatPoints(remaining)} /><StatCardShim label="Current leader" value={tied ? 'Tied' : leader.teamName} /></div>
    <section className="card"><h3>Round-by-round</h3>{tourRounds.map((round) => <p key={round.id}><strong>Round {round.roundNumber}:</strong> {round.name} · {round.status}</p>)}{tour.status === 'complete' && <p>Winner: {tied ? 'Shared' : leader.teamName}</p>}</section>
  </div>;
}
function StatCardShim({ label, value }: { label: string; value: string | number }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong></article>; }
