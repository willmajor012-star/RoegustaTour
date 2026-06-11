import type { CSSProperties } from 'react';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { getPlayerInitials } from '../lib/people';
import type { Player, TourPlayer, TourTeam, TourTeamMember } from '../lib/types';
import { normalizeTeamColour } from '../lib/teamColours';

const emptyTeamsData: Omit<PublicAdvancedStatsResponse, 'source'> = { players: [], tours: [], tourTeams: [], tourPlayers: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };

type TeamMemberRow = { player: Player; attendance?: TourPlayer; isCaptain: boolean };

function getCurrentTourId(data: Omit<PublicAdvancedStatsResponse, 'source'>) {
  return data.currentTour?.id ?? [...data.tours].sort((a, b) => b.year - a.year)[0]?.id;
}

function membersForTeam(team: TourTeam, members: TourTeamMember[], players: Player[], tourPlayers: TourPlayer[]): TeamMemberRow[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const attendanceByPlayer = new Map(tourPlayers.map((tourPlayer) => [tourPlayer.playerId, tourPlayer]));
  return members
    .filter((member) => member.teamId === team.id)
    .map((member) => playerById.get(member.playerId))
    .filter((player): player is Player => player !== undefined && player.active !== false)
    .map((player) => ({ player, attendance: attendanceByPlayer.get(player.id), isCaptain: player.id === team.captainPlayerId }))
    .sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain) || a.player.displayName.localeCompare(b.player.displayName, undefined, { sensitivity: 'base' }));
}

function hasCleanHandicap(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= -10 && value <= 54;
}

export function Teams() {
  const { data, loading, error } = usePublicData(fetchPublicAdvancedStats);
  const activeData = data ?? emptyTeamsData;
  const currentTourId = getCurrentTourId(activeData);
  const teams = activeData.tourTeams.filter((team) => !currentTourId || team.tourId === currentTourId).sort((a, b) => a.sortOrder - b.sortOrder);
  const currentMembers = activeData.tourTeamMembers.filter((member) => !currentTourId || member.tourId === currentTourId);
  const currentTourPlayers = (activeData.tourPlayers ?? []).filter((tourPlayer) => !currentTourId || tourPlayer.tourId === currentTourId);
  const assignedPlayerIds = new Set(currentMembers.map((member) => member.playerId));
  const unassigned: TeamMemberRow[] = currentTourPlayers
    .filter((tourPlayer) => tourPlayer.attending && !assignedPlayerIds.has(tourPlayer.playerId))
    .flatMap((tourPlayer) => {
      const player = activeData.players.find((candidate) => candidate.id === tourPlayer.playerId);
      return player && player.active !== false ? [{ player, attendance: tourPlayer, isCaptain: false }] : [];
    })
    .sort((a, b) => a.player.displayName.localeCompare(b.player.displayName, undefined, { sensitivity: 'base' }));

  return <div className="page-stack teams-page"><section className="page-title premium-title"><h2>Teams</h2></section>
    {loading && <p className="card">Loading teams…</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && teams.length === 0 && <p className="card">Teams will appear once captains publish squads.</p>}
    <div className="team-card-grid">
      {teams.map((team, index) => {
        const members = membersForTeam(team, currentMembers, activeData.players, currentTourPlayers);
        const captain = activeData.players.find((player) => player.id === team.captainPlayerId);
        return <article className="team-display-card card" key={team.id} style={{ '--team-colour': normalizeTeamColour(team.colour, index) } as CSSProperties}>
          <div className="team-card-topline"><span className="team-dot" /><p className="eyebrow">Team</p></div>
          <h3>{team.name}</h3>
          {captain && <div className="captain-strip"><span>Captain</span><strong>{captain.displayName}</strong></div>}
          <TeamMemberList members={members} captainPlayerId={team.captainPlayerId} />
        </article>;
      })}
    </div>
    {unassigned.length > 0 && <section className="card unassigned-players-card"><div className="stats-section-title"><h3>Players</h3><span>Unassigned</span></div><TeamMemberList members={unassigned} /></section>}
  </div>;
}

function TeamMemberList({ members, captainPlayerId }: { members: TeamMemberRow[]; captainPlayerId?: string }) {
  return <div className="team-member-list">
    {members.length === 0 ? <p>Players TBC</p> : members.map(({ player, attendance, isCaptain }) => <div className="team-member-row" key={player.id}>
      <span className="avatar small">{getPlayerInitials(player)}</span>
      <div><strong>{player.displayName}</strong>{player.nickname && <span>{player.nickname}</span>}</div>
      <div className="team-member-flags">{(isCaptain || player.id === captainPlayerId) && <span className="captain-badge">Captain</span>}{hasCleanHandicap(attendance?.tourHandicap) && <span>Hcp {attendance!.tourHandicap}</span>}</div>
    </div>)}
  </div>;
}
