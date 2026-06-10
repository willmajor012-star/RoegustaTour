import type { CSSProperties } from 'react';
import type { Round, TeamScoreRow } from '../lib/types';
import { formatPoints } from '../lib/formatting';

const fallbackColours = ['#0F2F24', '#6E2635'];

type Props = { scores: TeamScoreRow[]; rounds: Round[] };
export function Scoreboard({ scores, rounds }: Props) {
  return (
    <section className="scoreboard">
      {scores.map((score, index) => (
        <div className="score-row" key={score.teamId} style={{ '--team-colour': score.colour || fallbackColours[index] || '#0F2F24' } as CSSProperties}>
          <div><span className="team-dot" /><strong>{score.teamName}</strong></div>
          <span className="score-total">{formatPoints(score.points)}</span>
          <div className="round-breakdown">
            {rounds.map((round) => <span key={round.id}>R{round.roundNumber}: {formatPoints(score.pointsByRound[round.id] ?? 0)}</span>)}
          </div>
        </div>
      ))}
    </section>
  );
}
