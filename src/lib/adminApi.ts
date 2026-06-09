import { clearStoredAdminSession, getAdminAuthorizationHeaders } from './adminSession';
import type { Player, Tour, TourPlayer, TourTeam, TourTeamMember, TourTeamResult } from './types';

export type AdminDataResponse = {
  ok: true;
  source: 'supabase';
  currentTour?: Tour;
  tours: Tour[];
  players: Player[];
  tourPlayers: TourPlayer[];
  tourTeams: TourTeam[];
  tourTeamMembers: TourTeamMember[];
  tourTeamResults: TourTeamResult[];
};

export type SavePlayerPayload = {
  id?: string;
  displayName: string;
  nickname?: string;
  initials?: string;
  active: boolean;
};

export type SaveTourPayload = {
  id: string;
  name: string;
  year: number;
  location?: string;
  startDate?: string;
  endDate?: string;
  status: Tour['status'];
  description?: string;
};

export type SaveTourPlayerPayload = {
  tourId: string;
  playerId: string;
  attending: boolean;
  tourHandicap?: number | null;
  notes?: string;
};

export type SaveTourTeamPayload = {
  id?: string;
  tourId: string;
  name: string;
  colour?: string;
  captainPlayerId?: string | null;
  sortOrder: number;
};

export type SaveTourTeamMembersPayload = {
  tourId: string;
  teamId: string;
  playerIds: string[];
};

async function fetchAdminJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...getAdminAuthorizationHeaders(),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  let payload: { message?: string } | undefined;
  try {
    payload = await response.json() as { message?: string };
  } catch {
    payload = undefined;
  }

  if (response.status === 401) {
    clearStoredAdminSession();
    throw new Error('Please sign in again.');
  }

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Admin request failed.');
  }

  return payload as T;
}

function postAdminJson<T>(path: string, payload: unknown): Promise<T> {
  return fetchAdminJson<T>(path, { method: 'POST', body: JSON.stringify(payload) });
}

export const fetchAdminData = () => fetchAdminJson<AdminDataResponse>('/.netlify/functions/admin-data', { method: 'GET' });
export const savePlayer = (payload: SavePlayerPayload) => postAdminJson<{ ok: true; player: Player }>('/.netlify/functions/admin-save-player', payload);
export const saveTour = (payload: SaveTourPayload) => postAdminJson<{ ok: true; tour: Tour }>('/.netlify/functions/admin-save-tour', payload);
export const saveTourPlayer = (payload: SaveTourPlayerPayload) => postAdminJson<{ ok: true; tourPlayer: TourPlayer; tourTeamMembers?: TourTeamMember[] }>('/.netlify/functions/admin-save-tour-player', payload);
export const saveTourTeam = (payload: SaveTourTeamPayload) => postAdminJson<{ ok: true; tourTeam: TourTeam }>('/.netlify/functions/admin-save-team', payload);
export const saveTourTeamMembers = (payload: SaveTourTeamMembersPayload) => postAdminJson<{ ok: true; tourTeamMembers: TourTeamMember[] }>('/.netlify/functions/admin-save-team-members', payload);
