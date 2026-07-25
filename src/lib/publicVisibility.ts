import type { Match, Round, Tour, TourTeam, TourTeamMember } from './types';

export function isPublicTour(tour?: Pick<Tour, 'status' | 'isCurrentPublic'>): boolean {
  if (!tour) return false;
  return tour.isCurrentPublic === true || tour.status === 'complete' || tour.status === 'archived';
}

export function isPublicRound(round: Pick<Round, 'status' | 'published'>, tour?: Pick<Tour, 'status' | 'isCurrentPublic'>): boolean {
  if (tour?.isCurrentPublic === true) return round.published === true;
  return isPublicTour(tour) && (round.published === true || round.status === 'complete');
}

export function isPublicMatch(match: Pick<Match, 'published' | 'status'>, round?: Pick<Round, 'status' | 'published'>, tour?: Pick<Tour, 'status' | 'isCurrentPublic'>): boolean {
  if (!tour || !round || !isPublicRound(round, tour)) return false;
  if (tour.isCurrentPublic === true) return match.published === true;
  return match.published === true || match.status === 'complete';
}

export function isPublicTeamRoster(tour: Pick<Tour, 'status' | 'isCurrentPublic'> | undefined, team: Pick<TourTeam, 'published'>): boolean {
  if (!tour || !isPublicTour(tour)) return false;
  if (tour.isCurrentPublic === true) return team.published === true;
  return tour.status === 'complete' || tour.status === 'archived' || team.published === true;
}

export function filterPublicRounds<TRound extends Round>(rounds: TRound[], tour?: Tour): TRound[] {
  return rounds.filter((round) => isPublicRound(round, tour));
}

export function filterPublicTeams<TTeam extends TourTeam>(teams: TTeam[], tour?: Tour): TTeam[] {
  return teams.filter((team) => isPublicTeamRoster(tour, team));
}

export function filterPublicTeamMembers<TMember extends TourTeamMember>(members: TMember[], publicTeams: Pick<TourTeam, 'id'>[]): TMember[] {
  const publicTeamIds = new Set(publicTeams.map((team) => team.id));
  return members.filter((member) => publicTeamIds.has(member.teamId));
}
