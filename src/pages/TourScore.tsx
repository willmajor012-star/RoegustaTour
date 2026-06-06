import { Scoreboard } from '../components/Scoreboard';
import { formatPoints } from '../lib/formatting';
import { fetchPublicScore, type PublicScoreResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

const emptyScoreData: Omit<PublicScoreResponse, 'source'> = { teams: [], rounds: [], matches: [], scores: [] };

export function TourScore() {
  const { data, loading, error } = usePublicData(fetchPublicScore);
  const activeData = data ?? emptyScoreData;
  const completedCount = activeData.matches.filter((match) => match.status === 'complete').length;
  const remaining = activeData.matches.filter((match) => match.status !== 'complete').reduce((sum, match) => sum + match.pointsAvailable, 0);
  const leader = activeData.scores[0];
  const tied = activeData.scores.length > 1 && activeData.scores[0]?.points === activeData.scores[1]?.points;

  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Ryder Cup-style score</p><h2>{activeData.tour?.name ?? 'Current tour score'}</h2></section>
    {loading && <p className="card">Loading score…</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && activeData.scores.length === 0 ? <p className="card">Team score will build as results are entered.</p> : <Scoreboard scores={activeData.scores} rounds={activeData.rounds} />}
    <div className="stat-grid"><StatCardShim label="Completed" value={completedCount} /><StatCardShim label="Remaining" value={formatPoints(remaining)} /><StatCardShim label="Current leader" value={completedCount === 0 ? 'TBC' : tied ? 'Tied' : leader?.teamName ?? 'TBC'} /></div>
    {!loading && !error && completedCount === 0 && <p className="card">Team score will build as results are entered.</p>}
    <section className="card"><h3>Round-by-round</h3>{activeData.rounds.length === 0 ? <p>No live data has been added yet.</p> : activeData.rounds.map((round) => <p key={round.id}><strong>Round {round.roundNumber}:</strong> {round.name} · {round.status}</p>)}{activeData.tour?.status === 'complete' && <p>Winner: {tied ? 'Shared' : leader?.teamName ?? 'TBC'}</p>}</section>
  </div>;
}
function StatCardShim({ label, value }: { label: string; value: string | number }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong></article>; }
