import type { CSSProperties } from 'react';
import type { TeamScoreRow } from '../lib/types';
import { formatPoints } from '../lib/formatting';
import { normalizeTeamColourPair } from '../lib/teamColours';


type Props = { scores: TeamScoreRow[]; href?: string; rounds?: unknown[]; hideCentreScore?: boolean };

function safeRows(scores: TeamScoreRow[]) {
  const left = scores[0] ?? { teamId: 'score-left-unavailable', teamName: 'Team unavailable', colour: '#062B22', points: 0, pointsByRound: {} };
  const right = scores[1] ?? { teamId: 'score-right-unavailable', teamName: 'Team unavailable', colour: '#7A1F2B', points: 0, pointsByRound: {} };
  const [leftColour, rightColour] = normalizeTeamColourPair(left.colour, right.colour);
  return [{ ...left, colour: leftColour }, { ...right, colour: rightColour }];
}

export function Scoreboard({ scores, href, hideCentreScore = false }: Props) {
  const rows = safeRows(scores);
  const [left, right] = rows;
  const content = (
    <section className={`scoreboard ${hideCentreScore ? 'no-centre-score' : ''}`} aria-label="Team score">
      <TeamBlock score={left} side="left" fallbackColour="#062B22" />
      {!hideCentreScore && <div className="scoreboard-centre" aria-hidden="true">
        <span>Score</span>
        <strong>{formatPoints(left.points)}–{formatPoints(right.points)}</strong>
      </div>}
      <TeamBlock score={right} side="right" fallbackColour="#7A1F2B" />
    </section>
  );

  return href ? <a className="scoreboard-link" href={href}>{content}</a> : content;
}

function TeamBlock({ score, side, fallbackColour }: { score: TeamScoreRow; side: 'left' | 'right'; fallbackColour: string }) {
  return (
    <div className={`score-team-block ${side}`} style={{ '--team-colour': score.colour || fallbackColour } as CSSProperties}>
      <span className="team-dot" />
      <strong>{score.teamName || 'Team unavailable'}</strong>
      <b>{formatPoints(score.points)}</b>
      <small>pts</small>
    </div>
  );
}
