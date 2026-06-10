import type { CSSProperties } from 'react';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { getPlayerInitials } from '../lib/people';

const emptyTeamsData: Omit<PublicAdvancedStatsResponse, 'source'> = { players: [], tours: [], tourTeams: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };

export function Teams() {
  const { data, loading, error } = usePublicData(fetchPublicAdvancedStats);
  const activeData = data ?? emptyTeamsData;
  const currentTourId = activeData.currentTour?.id ?? [...activeData.tours].sort((a, b) => b.year - a.year)[0]?.id;
  const teams = activeData.tourTeams.filter((team) => !currentTourId || team.tourId === currentTourId).sort((a, b) => a.sortOrder - b.sortOrder);

  return <div className="page-stack teams-page"><section className="page-title premium-title"><p className="eyebrow">Team room</p><h2>Teams</h2><p>Captain groups and player squads for the current Roegusta Tour.</p></section>
    {loading && <p className="card">Loading teams…</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && teams.length === 0 && <p className="card">Teams will appear once captains publish the tour squads.</p>}
    <div className="team-card-grid">
      {teams.map((team) => {
        const members = activeData.tourTeamMembers.filter((member) => member.teamId === team.id).map((member) => activeData.players.find((player) => player.id === member.playerId)).filter(Boolean);
        const captain = activeData.players.find((player) => player.id === team.captainPlayerId);
        return <article className="team-display-card card" key={team.id} style={{ '--team-colour': team.colour ?? '#B89A5D' } as CSSProperties}>
          <div className="team-card-topline"><span className="team-dot" /><p className="eyebrow">Roegusta side</p></div>
          <h3>{team.name}</h3>
          {captain && <div className="captain-strip"><span>Captain</span><strong>{captain.displayName}</strong></div>}
          <div className="team-member-list">
            {members.length === 0 ? <p>Players TBC.</p> : members.map((player) => <div className="team-member-row" key={player!.id}><span className="avatar small">{getPlayerInitials(player)}</span><div><strong>{player!.displayName}</strong>{player!.id === team.captainPlayerId && <span>Captain</span>}</div></div>)}
          </div>
        </article>;
      })}
    </div>
  </div>;
}
