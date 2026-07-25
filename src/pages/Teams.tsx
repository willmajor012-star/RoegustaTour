import { useEffect, useState, type CSSProperties } from 'react';
import { PageHeader } from '../components/PageHeader';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { getPlayerInitials } from '../lib/people';
import { tourDisplayPlayer } from '../lib/playerDisplay';
import type { Player, TourPlayer, TourTeam, TourTeamMember } from '../lib/types';
import { normalizeTeamColour } from '../lib/teamColours';

const emptyTeamsData: Omit<PublicAdvancedStatsResponse, 'source'> = { players: [], tours: [], tourTeams: [], tourPlayers: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };

type TeamMemberRow = { player: Player; attendance?: TourPlayer; isCaptain: boolean };
type SelectedPlayer = TeamMemberRow & { team?: TourTeam };

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
    .map((player) => ({ player: tourDisplayPlayer(player, attendanceByPlayer.get(player.id)), attendance: attendanceByPlayer.get(player.id), isCaptain: player.id === team.captainPlayerId }))
    .sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain) || a.player.displayName.localeCompare(b.player.displayName, undefined, { sensitivity: 'base' }));
}

function hasCleanHandicap(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= -10 && value <= 54;
}

export function Teams() {
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer>();
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
      return player && player.active !== false ? [{ player: tourDisplayPlayer(player, tourPlayer), attendance: tourPlayer, isCaptain: false }] : [];
    })
    .sort((a, b) => a.player.displayName.localeCompare(b.player.displayName, undefined, { sensitivity: 'base' }));
  useEffect(() => {
    if (!selectedPlayer) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPlayer(undefined);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedPlayer]);

  return <div className="page-stack teams-page">
    <PageHeader title="Teams & players" eyebrow={activeData.currentTour?.name ?? 'Current tour'} />
    {loading && <p className="card">Loading teams…</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && teams.length === 0 && <p className="card">Teams will appear once captains publish squads.</p>}
    <div className="team-card-grid teams-player-grid">
      {teams.map((team, index) => {
        const members = membersForTeam(team, currentMembers, activeData.players, currentTourPlayers);
        const captain = members.find((member) => member.isCaptain)?.player ?? activeData.players.find((player) => player.id === team.captainPlayerId);
        return <article className="team-display-card card" key={team.id} style={{ '--team-colour': normalizeTeamColour(team.colour, index) } as CSSProperties}>
          <div className="team-card-heading"><div><p className="eyebrow">Team</p><h3>{team.name}</h3></div><span>{members.length} player{members.length === 1 ? '' : 's'}</span></div>
          {captain && <div className="captain-strip"><span>Captain</span><strong>{captain.displayName}</strong></div>}
          <TeamMemberList members={members} captainPlayerId={team.captainPlayerId} onSelect={(member) => setSelectedPlayer({ ...member, team })} />
        </article>;
      })}
    </div>
    {unassigned.length > 0 && <section className="card unassigned-players-card"><div className="stats-section-title"><h3>Unassigned players</h3><span>{unassigned.length}</span></div><TeamMemberList members={unassigned} onSelect={setSelectedPlayer} /></section>}
    {selectedPlayer && <PlayerProfileDrawer selected={selectedPlayer} onClose={() => setSelectedPlayer(undefined)} />}
  </div>;
}

function TeamMemberList({ members, captainPlayerId, onSelect }: { members: TeamMemberRow[]; captainPlayerId?: string; onSelect: (member: TeamMemberRow) => void }) {
  return <div className="team-member-list">
    {members.length === 0 ? <p>Players TBC</p> : members.map((member) => {
      const { player, attendance, isCaptain } = member;
      return <button type="button" className="team-member-row" key={player.id} onClick={() => onSelect(member)} aria-label={`Open ${player.displayName}'s profile`}>
        {player.photoUrl ? <img className="avatar small player-tile-photo" src={player.photoUrl} alt="" /> : <span className="avatar small">{getPlayerInitials(player)}</span>}
        <span className="team-member-copy"><strong>{player.displayName}</strong>{player.nickname && <small>{player.nickname}</small>}</span>
        <span className="team-member-flags">{(isCaptain || player.id === captainPlayerId) && <span className="captain-badge">Captain</span>}{hasCleanHandicap(attendance?.tourHandicap) && <span>Hcp {attendance!.tourHandicap}</span>}<b aria-hidden="true">›</b></span>
      </button>;
    })}
  </div>;
}

function PlayerProfileDrawer({ selected, onClose }: { selected: SelectedPlayer; onClose: () => void }) {
  const { player, attendance, isCaptain, team } = selected;
  return <div className="player-drawer-backdrop" onMouseDown={onClose}>
    <aside className="player-profile-drawer" role="dialog" aria-modal="true" aria-labelledby="player-drawer-title" onMouseDown={(event) => event.stopPropagation()} style={{ '--team-colour': normalizeTeamColour(team?.colour, team?.sortOrder ?? 0) } as CSSProperties}>
      <button className="player-drawer-close" type="button" onClick={onClose} aria-label="Close player profile">×</button>
      <div className="player-drawer-identity">
        {player.photoUrl ? <img className="player-drawer-photo" src={player.photoUrl} alt={player.displayName} /> : <span className="player-drawer-photo initials">{getPlayerInitials(player)}</span>}
        <div><p className="eyebrow">{team?.name ?? 'Tour player'}{isCaptain ? ' · Captain' : ''}</p><h2 id="player-drawer-title">{player.displayName}</h2>{player.nickname && <p>{player.nickname}</p>}</div>
      </div>
      <div className="player-drawer-facts">
        <span><small>Tour handicap</small><strong>{hasCleanHandicap(attendance?.tourHandicap) ? attendance!.tourHandicap : 'TBC'}</strong></span>
        <span><small>Role</small><strong>{isCaptain ? 'Captain' : 'Player'}</strong></span>
      </div>
      {player.profileBio && <p className="player-drawer-bio">{player.profileBio}</p>}
      <a className="player-stats-link" href="/stats">View detailed stats <span aria-hidden="true">›</span></a>
    </aside>
  </div>;
}
