import type { CSSProperties } from 'react';
import { usePublicData } from '../lib/usePublicData';
import { fetchPublicWinPrediction } from '../lib/publicApi';
import { normalizeTeamColour } from '../lib/teamColours';
import type { TeamScoreRow } from '../lib/types';

export function WinPredictor({ teams }: { teams: TeamScoreRow[] }) {
  const { data, loading, error } = usePublicData(fetchPublicWinPrediction);
  const p = data?.prediction;
  if (loading) return <div className="win-predictor win-predictor-pending"><span>Tour win predictor</span><small>Loading prediction…</small></div>;
  if (error) return <div className="win-predictor win-predictor-pending"><span>Tour win predictor</span><small>Prediction temporarily unavailable</small></div>;
  if (!p || p.status === 'unavailable') return null;
  if (p.status === 'awaiting_teams' || !p.percentages) return <div className="win-predictor win-predictor-pending"><span>Tour win predictor</span><small>Available once teams are confirmed</small></div>;
  const [a, draw, b] = p.percentages;
  const left = teams.find((t) => t.teamId === p.teamIds[0]); const right = teams.find((t) => t.teamId === p.teamIds[1]);
  const nameA = left?.teamName ?? 'Team 1', nameB = right?.teamName ?? 'Team 2';
  return <div className="win-predictor" style={{ '--predict-left': normalizeTeamColour(left?.colour, 0), '--predict-right': normalizeTeamColour(right?.colour, 1) } as CSSProperties}>
    <div className="win-predictor-heading"><span>Tour win predictor</span><small>{p.basis === 'decided' ? draw === 100 ? 'Tour tied' : 'Victory secured' : 'Estimate'}</small></div>
    <div className="win-predictor-labels"><div><strong>{a}%</strong><span>{nameA}</span></div><div><strong>{b}%</strong><span>{nameB}</span></div></div>
    <div className="win-predictor-track" role="img" aria-label={`${nameA} ${a} percent, draw ${draw} percent, ${nameB} ${b} percent`}>
      <span className="win-predictor-left" style={{ width: `${a}%` }} /><span className="win-predictor-draw" style={{ width: `${draw}%` }} /><span className="win-predictor-right" style={{ width: `${b}%` }} />
    </div>
    <div className="win-predictor-foot"><span>Draw {draw}%</span>{p.basis !== 'decided' ? <span>{p.basis === 'teams' ? 'Based on team line-ups' : p.basis === 'draws' ? 'Based on confirmed pairings' : 'Updated with results'}</span> : null}</div>
  </div>;
}
