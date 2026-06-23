import { useState, type CSSProperties } from 'react';
import type { Player, TourTeam } from '../lib/types';
import { getPlayerInitials } from '../lib/people';
import { normalizeTeamColour } from '../lib/teamColours';

type TeamPlayer = { player: Player; team: TourTeam; isCaptain?: boolean };

function Avatar({ player, colour, size = 'normal' }: { player: Player; colour: string; size?: 'normal' | 'large' }) {
  return player.photoUrl ? <img className={`profile-avatar ${size}`} src={player.photoUrl} alt={`${player.displayName} profile`} /> : <span className={`profile-avatar initials ${size}`} style={{ '--team-colour': colour } as CSSProperties}>{getPlayerInitials(player)}</span>;
}

export function TeamRosterCards({ entries }: { entries: TeamPlayer[] }) {
  const [selected, setSelected] = useState<TeamPlayer | null>(null);
  return <>
    <div className="team-profile-grid">{entries.map((entry, index) => {
      const colour = normalizeTeamColour(entry.team.colour, index);
      return <button type="button" className="team-player-profile-card" key={`${entry.team.id}-${entry.player.id}`} style={{ '--team-colour': colour } as CSSProperties} onClick={() => setSelected(entry)}>
        <Avatar player={entry.player} colour={colour} />
        <span><strong>{entry.player.displayName}</strong>{entry.player.nickname ? <em>“{entry.player.nickname}”</em> : null}{entry.isCaptain ? <small>Captain</small> : null}</span>
      </button>;
    })}</div>
    {selected ? <PlayerProfileModal entry={selected} onClose={() => setSelected(null)} /> : null}
  </>;
}

function PlayerProfileModal({ entry, onClose }: { entry: TeamPlayer; onClose: () => void }) {
  const colour = normalizeTeamColour(entry.team.colour, 0);
  return <div className="profile-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="profile-modal card" role="dialog" aria-modal="true" aria-labelledby="player-profile-title" onClick={(event) => event.stopPropagation()} style={{ '--team-colour': colour } as CSSProperties}>
      <button className="profile-modal-close" type="button" onClick={onClose} aria-label="Close player profile">×</button>
      <Avatar player={entry.player} colour={colour} size="large" />
      <p className="eyebrow">{entry.team.name}{entry.isCaptain ? ' · Captain' : ''}</p>
      <h3 id="player-profile-title">{entry.player.displayName}</h3>
      {entry.player.nickname ? <p className="profile-nickname">“{entry.player.nickname}”</p> : null}
      {entry.player.profileBio ? <p>{entry.player.profileBio}</p> : <p className="muted">Profile details TBC.</p>}
    </section>
  </div>;
}
