import type { CSSProperties } from 'react';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { getPlayerInitials } from '../lib/people';
import type { Player, TourTeam, TourTeamMember, TourPlayer } from '../lib/types';

const emptyPlayersData: Omit<PublicAdvancedStatsResponse, 'source'> = {
  players: [],
  tours: [],
  tourTeams: [],
  tourPlayers: [],
  tourTeamMembers: [],
  tourTeamResults: [],
  rounds: [],
  matches: [],
  matchParticipants: [],
};

type DirectoryPlayer = {
  player: Player;
  team?: TourTeam;
  attendance?: TourPlayer;
  isCaptain: boolean;
};

type DirectoryGroup = {
  id: string;
  name: string;
  colour?: string;
  players: DirectoryPlayer[];
};

function playerNameSort(a: DirectoryPlayer, b: DirectoryPlayer) {
  return a.player.displayName.localeCompare(b.player.displayName, undefined, { sensitivity: 'base' });
}

function buildGroups(players: Player[], teams: TourTeam[], members: TourTeamMember[], tourPlayers: TourPlayer[], currentTourId?: string): DirectoryGroup[] {
  const currentTeams = teams.filter((team) => !currentTourId || team.tourId === currentTourId).sort((a, b) => a.sortOrder - b.sortOrder);
  const currentMembers = members.filter((member) => !currentTourId || member.tourId === currentTourId);
  const currentTourPlayers = tourPlayers.filter((tourPlayer) => !currentTourId || tourPlayer.tourId === currentTourId);
  const attendanceByPlayer = new Map(currentTourPlayers.map((tourPlayer) => [tourPlayer.playerId, tourPlayer]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const assignedPlayerIds = new Set(currentMembers.map((member) => member.playerId));

  const teamGroups: DirectoryGroup[] = currentTeams.map((team) => ({
    id: team.id,
    name: team.name,
    colour: team.colour,
    players: currentMembers
      .filter((member) => member.teamId === team.id)
      .map((member) => playerById.get(member.playerId))
      .filter((player): player is Player => player !== undefined && player.active !== false)
      .map((player) => ({ player, team, attendance: attendanceByPlayer.get(player.id), isCaptain: player.id === team.captainPlayerId }))
      .sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain) || playerNameSort(a, b)),
  })).filter((group) => group.players.length > 0);

  const attendingUnassigned = currentTourPlayers
    .filter((tourPlayer) => tourPlayer.attending && !assignedPlayerIds.has(tourPlayer.playerId))
    .map((tourPlayer) => playerById.get(tourPlayer.playerId))
    .filter((player): player is Player => player !== undefined && player.active !== false)
    .map((player) => ({ player, attendance: attendanceByPlayer.get(player.id), isCaptain: false }))
    .sort(playerNameSort);

  if (attendingUnassigned.length > 0) {
    teamGroups.push({ id: 'unassigned', name: 'Unassigned / attending', colour: '#B89A5D', players: attendingUnassigned });
  }

  if (teamGroups.length === 0) {
    const activePlayers = players
      .filter((player) => player.active !== false)
      .map((player) => ({ player, attendance: attendanceByPlayer.get(player.id), isCaptain: false }))
      .sort(playerNameSort);
    if (activePlayers.length > 0) teamGroups.push({ id: 'active', name: 'Players', colour: '#0F2F24', players: activePlayers });
  }

  return teamGroups;
}

export function Players() {
  const { data, loading, error } = usePublicData(fetchPublicAdvancedStats);
  const activeData = data ?? emptyPlayersData;
  const currentTourId = activeData.currentTour?.id ?? [...activeData.tours].sort((a, b) => b.year - a.year)[0]?.id;
  const groups = buildGroups(activeData.players, activeData.tourTeams, activeData.tourTeamMembers, activeData.tourPlayers ?? [], currentTourId);

  return <div className="page-stack players-page">
    <section className="page-title premium-title">
      <p className="eyebrow">Player directory</p>
      <h2>Players</h2>
      <p>Current Roegusta names, nicknames and team assignments for quick clubhouse lookup.</p>
    </section>
    {loading && <p className="card">Loading players…</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && groups.length === 0 && <p className="card">Players will appear once the current tour directory has been published.</p>}
    <div className="player-directory-groups">
      {groups.map((group) => <section className="player-directory-group card" key={group.id} style={{ '--team-colour': group.colour ?? '#0F2F24' } as CSSProperties}>
        <div className="directory-group-heading">
          <span className="team-dot" />
          <h3>{group.name}</h3>
          <small>{group.players.length} player{group.players.length === 1 ? '' : 's'}</small>
        </div>
        <div className="player-directory-list">
          {group.players.map(({ player, team, attendance, isCaptain }) => <article className="player-directory-row" key={player.id}>
            <span className="avatar">{getPlayerInitials(player)}</span>
            <div>
              <strong>{player.displayName}</strong>
              <p>{player.nickname ? `“${player.nickname}”` : team?.name ?? (attendance?.attending ? 'Attending' : 'Current tour')}</p>
            </div>
            {isCaptain && <span className="captain-badge">Captain</span>}
          </article>)}
        </div>
      </section>)}
    </div>
  </div>;
}
