import type { CSSProperties } from 'react';
import type { TeamScoreRow } from '../lib/types';
import { formatPoints } from '../lib/formatting';

const fallbackRows: TeamScoreRow[] = [
  { teamId: 'team-1-tbc', teamName: 'Team 1 TBC', colour: '#062B22', points: 0, pointsByRound: {} },
  { teamId: 'team-2-tbc', teamName: 'Team 2 TBC', colour: '#7A1E1E', points: 0, pointsByRound: {} },
];

type Props = { scores: TeamScoreRow[]; href?: string; rounds?: unknown[] };

function safeRows(scores: TeamScoreRow[]) {
  return [scores[0] ?? fallbackRows[0], scores[1] ?? fallbackRows[1]];
}

export function Scoreboard({ scores, href }: Props) {
  const rows = safeRows(scores);
  const [left, right] = rows;
  const content = (
    <section className="scoreboard" aria-label="Team score">
      <TeamBlock score={left} side="left" fallbackColour="#062B22" />
      <div className="scoreboard-centre" aria-hidden="true">
        <span>Score</span>
        <strong>{formatPoints(left.points)}–{formatPoints(right.points)}</strong>
      </div>
      <TeamBlock score={right} side="right" fallbackColour="#7A1E1E" />
    </section>
  );

  return href ? <a className="scoreboard-link" href={href}>{content}</a> : content;
}

function TeamBlock({ score, side, fallbackColour }: { score: TeamScoreRow; side: 'left' | 'right'; fallbackColour: string }) {
  return (
    <div className={`score-team-block ${side}`} style={{ '--team-colour': score.colour || fallbackColour } as CSSProperties}>
      <span className="team-dot" />
      <strong>{score.teamName || (side === 'left' ? 'Team 1 TBC' : 'Team 2 TBC')}</strong>
      <b>{formatPoints(score.points)}</b>
      <small>pts</small>
    </div>
  );
}
