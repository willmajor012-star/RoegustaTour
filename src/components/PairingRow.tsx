import type { CSSProperties } from 'react';
import { normalizeTeamColour } from '../lib/teamColours';
import type { TourTeam } from '../lib/types';

export type PairingSide = {
  id: string;
  names: string;
  team?: TourTeam;
  label: string;
  note?: string;
};

export function comparePairingSides(a: PairingSide, b: PairingSide) {
  return (a.team?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.team?.sortOrder ?? Number.MAX_SAFE_INTEGER);
}

export function PairingRow({ time, label, detail, lineups }: {
  time?: string;
  label: string;
  detail?: string;
  lineups: PairingSide[][];
}) {
  return <article className="pairing-row">
    <header className="pairing-row-heading">
      {time && <strong>{time}</strong>}
      <span>{label}</span>
      {detail && <small className="pairing-row-detail">{detail}</small>}
    </header>
    {lineups.map((lineup, i) => <div className="public-tee-pair-grid" key={i}>
      {[...lineup].sort(comparePairingSides).map((side, index) =>
        <div className="public-tee-pair" key={side.id} style={side.team ? { '--tee-team-colour': normalizeTeamColour(side.team.colour, index) } as CSSProperties : undefined}>
          <small>{side.team?.name ?? side.label}</small>
          <strong>{side.names}</strong>
          {side.note && <small>{side.note}</small>}
        </div>
      )}
    </div>)}
  </article>;
}
