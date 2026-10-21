import { Scoreboard } from '../components/Scoreboard';
import { PageHeader } from '../components/PageHeader';
import { formatPoints } from '../lib/formatting';
import { formatRoundDisplayName } from '../lib/display';
import { fetchPublicScore, type PublicScoreResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

const emptyScoreData: Omit<PublicScoreResponse, 'source'> = { teams: [], rounds: [], matches: [], scores: [] };

export function TourScore() {
  const { data, loading, error } = usePublicData(fetchPublicScore);
  const activeData = data ?? emptyScoreData;
  const completedCount = activeData.matches.filter((match) => match.status === 'complete').length;
  const confirmed2026 = activeData.tour?.rulesVersion === 'confirmed-2026';
  const remaining = confirmed2026 ? 57 - activeData.scores.reduce((sum, s) => sum + s.points, 0) : activeData.matches.filter((match) => match.status !== 'complete' && match.status !== 'void').reduce((sum, match) => sum + match.pointsAvailable, 0);
  const leader = activeData.scores[0];
  const tied = activeData.scores.length > 1 && activeData.scores[0]?.points === activeData.scores[1]?.points;

  return <div className="page-stack score-page"><PageHeader title="Tour score" eyebrow={activeData.tour?.name ?? 'Current tour'} />
    {confirmed2026 ? <p className="card">57 points available · 29 guarantees victory · 28.5 each is a tie. Combined Friday–Monday points are confirmed once, after both nines and all ties are complete. <a href="/competitions">View projected and confirmed competition points</a></p> : null}
    {loading && <p className="card">Loading score…</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && activeData.scores.length === 0 ? <p className="card">Team score will build as results are entered.</p> : <Scoreboard scores={activeData.scores} rounds={activeData.rounds} />}
    <div className="stat-grid"><StatCardShim label="Completed" value={completedCount} /><StatCardShim label="Remaining" value={formatPoints(remaining)} /><StatCardShim label="Current leader" value={activeData.scores.every((s) => s.points === 0) ? 'TBC' : tied ? 'Tied' : leader?.teamName ?? 'TBC'} /></div>
    {!loading && !error && completedCount === 0 && <p className="card">Team score will build as results are entered.</p>}
    <section className="card"><h3>Round-by-round</h3>{activeData.rounds.length === 0 ? <p>Round scores TBC.</p> : activeData.rounds.map((round, index) => <p key={round.id}><strong>{formatRoundDisplayName(round, index)}</strong></p>)}{activeData.tour?.status === 'complete' && <p>Winner: {tied ? 'Shared' : leader?.teamName ?? 'TBC'}</p>}</section>
  </div>;
}
function StatCardShim({ label, value }: { label: string; value: string | number }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong></article>; }
