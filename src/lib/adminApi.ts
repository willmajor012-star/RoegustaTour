import { clearStoredAdminSession, getAdminAuthorizationHeaders } from './adminSession';
import type { Bet, BetMarket, BetOption, Match, MatchFormat, MatchParticipant, Player, Round, Tour, TourPlayer, TourTeam, TourTeamMember, TourTeamResult } from './types';
import type { TourHandbookSection } from './publicApi';

export type AdminDataResponse = {
  ok: true;
  source: 'supabase';
  selectedTour?: Tour;
  currentTour?: Tour;
  tours: Tour[];
  players: Player[];
  tourPlayers: TourPlayer[];
  tourTeams: TourTeam[];
  tourTeamMembers: TourTeamMember[];
  tourTeamResults: TourTeamResult[];
  rounds: Round[];
  matches: Match[];
  matchParticipants: MatchParticipant[];
  betMarkets: BetMarket[];
  betOptions: BetOption[];
  bets: Bet[];
  handbookSections: TourHandbookSection[];
};

export type SavePlayerPayload = {
  id?: string;
  displayName: string;
  nickname?: string;
  initials?: string;
  photoUrl?: string;
  profileBio?: string;
  active: boolean;
};

export type SaveTourPayload = {
  id?: string;
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

export type SaveRoundPayload = {
  id?: string;
  tourId: string;
  roundNumber: number;
  name: string;
  roundDate?: string | null;
  courseName?: string | null;
  teeTime?: string | null;
  format?: MatchFormat;
  formatLabel?: string | null;
  notes?: string | null;
  status: Round['status'];
};

export type SaveMatchPayload = {
  id?: string;
  tourId: string;
  roundId: string;
  matchNumber: number;
  format: MatchFormat;
  status: Match['status'];
  sideATeamId: string;
  sideBTeamId: string;
  sideALabel?: string | null;
  sideBLabel?: string | null;
  pointsAvailable: number;
  teeTime?: string | null;
  published?: boolean;
  notes?: string | null;
  pointsSideA?: number | null;
  pointsSideB?: number | null;
  winningSide?: Match['winningSide'] | null;
  resultText?: string | null;
  sideAPlayerIds: string[];
  sideBPlayerIds: string[];
};


export type SaveBetOptionPayload = {
  id?: string;
  label: string;
  linkedPlayerId?: string | null;
  linkedTeamId?: string | null;
  linkedMatchSide?: BetOption['linkedMatchSide'] | null;
  oddsDecimal?: number | null;
  sortOrder: number;
};

export type SaveBetMarketPayload = {
  id?: string;
  tourId: string;
  roundId?: string | null;
  matchId?: string | null;
  title: string;
  description?: string | null;
  marketType: BetMarket['marketType'];
  marketScope: BetMarket['marketScope'];
  status: BetMarket['status'];
  closesAt?: string | null;
  resultOptionId?: string | null;
  resultText?: string | null;
  required?: boolean;
  options: SaveBetOptionPayload[];
};

export type SubmitResultPayload = {
  tourId: string;
  matchId: string;
  pointsSideA: number;
  pointsSideB: number;
  resultText: string;
  published?: boolean;
  correctionReason?: string | null;
  clearResult?: boolean;
};

export type SaveHandbookSectionPayload = { id?: string; tourId: string; sectionKey: string; title: string; body?: string | null; sortOrder: number };

export type SettleBetMarketPayload = {
  marketId: string;
  resultOptionId: string;
  settlementNote?: string | null;
  correction?: boolean;
};

export type SaveBetPayload = {
  id?: string;
  marketId?: string;
  optionId: string;
  bettorName: string;
  bettorPlayerId?: string | null;
  stakeAmountPence: number;
  comment?: string | null;
  adminNotes?: string | null;
  voidReason?: string | null;
  status?: Bet['status'];
};

export type UpdateBetPayload = {
  id: string;
  status: Bet['status'];
  outcomeStatus: Bet['outcomeStatus'];
  payoutStatus: Bet['payoutStatus'];
  payoutAmountPence?: number | null;
  payoutNotes?: string | null;
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

export const fetchAdminData = (tourId?: string) => fetchAdminJson<AdminDataResponse>(`/.netlify/functions/admin-data${tourId ? `?tourId=${encodeURIComponent(tourId)}` : ''}`, { method: 'GET' });
export const savePlayer = (payload: SavePlayerPayload) => postAdminJson<{ ok: true; player: Player }>('/.netlify/functions/admin-save-player', payload);
export const saveTour = (payload: SaveTourPayload) => postAdminJson<{ ok: true; tour: Tour }>('/.netlify/functions/admin-save-tour', payload);
export const setCurrentPublicTour = (payload: { tourId: string }) => postAdminJson<{ ok: true; tour: Tour }>('/.netlify/functions/admin-set-current-public-tour', payload);
export const deleteTour = (payload: { id: string }) => postAdminJson<{ ok: true; deletedTourId: string }>('/.netlify/functions/admin-delete-tour', payload);
export const saveTourPlayer = (payload: SaveTourPlayerPayload) => postAdminJson<{ ok: true; tourPlayer: TourPlayer; tourTeamMembers?: TourTeamMember[] }>('/.netlify/functions/admin-save-tour-player', payload);
export const saveTourTeam = (payload: SaveTourTeamPayload) => postAdminJson<{ ok: true; tourTeam: TourTeam }>('/.netlify/functions/admin-save-team', payload);
export const updateTeamPublished = (payload: { tourId: string; teamId: string; published: boolean }) => postAdminJson<{ ok: true; tourTeam: TourTeam }>('/.netlify/functions/admin-update-team-published', payload);
export const deleteTeam = (payload: { id: string; tourId: string }) => postAdminJson<{ ok: true; deletedTeamId: string }>('/.netlify/functions/admin-delete-team', payload);
export const saveTourTeamMembers = (payload: SaveTourTeamMembersPayload) => postAdminJson<{ ok: true; tourTeamMembers: TourTeamMember[] }>('/.netlify/functions/admin-save-team-members', payload);
export const saveRound = (payload: SaveRoundPayload) => postAdminJson<{ ok: true; round: Round }>('/.netlify/functions/admin-save-round', payload);
export const updateRoundPublished = (payload: { tourId: string; roundId: string; published: boolean }) => postAdminJson<{ ok: true; round: Round }>('/.netlify/functions/admin-update-round-published', payload);
export const deleteRound = (payload: { id: string; tourId: string }) => postAdminJson<{ ok: true; deletedRoundId: string }>('/.netlify/functions/admin-delete-round', payload);
export const saveMatch = (payload: SaveMatchPayload) => postAdminJson<{ ok: true; match: Match; matchParticipants: MatchParticipant[] }>('/.netlify/functions/admin-save-match', payload);
export const updateMatchPublished = (payload: { tourId: string; matchId: string; published: boolean }) => postAdminJson<{ ok: true; match: Match }>('/.netlify/functions/admin-update-match-published', payload);
export const submitResult = (payload: SubmitResultPayload) => postAdminJson<{ ok: true; match: Match }>('/.netlify/functions/admin-submit-result', payload);
export const deleteMatch = (payload: { id: string; tourId: string }) => postAdminJson<{ ok: true; deletedMatchId: string }>('/.netlify/functions/admin-delete-match', payload);
export const saveBetMarket = (payload: SaveBetMarketPayload) => postAdminJson<{ ok: true; betMarket: BetMarket; betOptions: BetOption[] }>('/.netlify/functions/admin-save-bet-market', payload);
export const settleBetMarket = (payload: SettleBetMarketPayload) => postAdminJson<{ ok: true; betMarket: BetMarket; bets: Bet[] }>('/.netlify/functions/admin-settle-bet-market', payload);
export const deleteBetMarket = (payload: { id: string; tourId: string }) => postAdminJson<{ ok: true; deletedBetMarketId: string }>('/.netlify/functions/admin-delete-bet-market', payload);
export const resetBetPuntoTour = (payload: { tourId: string; confirmation: string; forceCurrent?: boolean }) => postAdminJson<{ ok: true; tourId: string; deletedMarketCount: number; deletedOptionCount: number; deletedBetCount: number }>('/.netlify/functions/admin-reset-bet-punto-tour', payload);
export const saveBet = (payload: SaveBetPayload) => postAdminJson<{ ok: true; bet: Bet }>('/.netlify/functions/admin-save-bet', payload);
export const updateBet = (payload: UpdateBetPayload) => postAdminJson<{ ok: true; bet: Bet }>('/.netlify/functions/admin-update-bet', payload);
export const deleteBet = (payload: { id: string }) => postAdminJson<{ ok: true; deletedBetId: string }>('/.netlify/functions/admin-delete-bet', payload);
export const saveHandbookSection = (payload: SaveHandbookSectionPayload) => postAdminJson<{ ok: true; handbookSection: TourHandbookSection }>('/.netlify/functions/admin-save-handbook-section', payload);
export const deleteHandbookSection = (payload: { id: string; tourId: string }) => postAdminJson<{ ok: true; deletedHandbookSectionId: string }>('/.netlify/functions/admin-delete-handbook-section', payload);
