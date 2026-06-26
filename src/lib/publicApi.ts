import type { AdvancedStatsData, MvpLeaderboardRow, PlayerAdvancedSummary, TourSummary } from './advancedStats';
import type { Bet, BetMarket, BetOption, Match, MatchParticipant, Player, Round, TeamScoreRow, Tour, TourPlayer, TourTeam, TourTeamMember } from './types';

export type PublicDataSource = 'supabase';
export type PublicResponse<T> = T & { source: PublicDataSource };

export type PublicSummaryResponse = PublicResponse<{
  tour?: Tour;
  rounds: Round[];
  recentResults: Match[];
  openMarkets: BetMarket[];
}>;

export type PublicScoreResponse = PublicResponse<{
  tour?: Tour;
  teams: TourTeam[];
  rounds: Round[];
  matches: Match[];
  scores: TeamScoreRow[];
}>;

export type PublicMatchesResponse = PublicResponse<{
  tour?: Tour;
  rounds: Round[];
  matches: Match[];
  matchParticipants: MatchParticipant[];
  players: Player[];
  tourPlayers: TourPlayer[];
  tourTeams: TourTeam[];
  tourTeamMembers: TourTeamMember[];
}>;

export type PublicPlayersResponse = PublicResponse<{
  players: Player[];
}>;

export type PublicBetMarketsResponse = PublicResponse<{
  rounds: Round[];
  players: Player[];
  tourPlayers: TourPlayer[];
  betMarkets: BetMarket[];
  betOptions: BetOption[];
  bets: Bet[];
}>;

export type PublicAdvancedStatsResponse = PublicResponse<AdvancedStatsData & {
  currentTour?: Tour;
  tourSummary?: TourSummary;
  mvpLeaderboard?: MvpLeaderboardRow[];
  playerSummaries?: PlayerAdvancedSummary[];
}>;

export type TourHandbookSection = {
  id: string;
  tourId: string;
  sectionKey: string;
  title: string;
  body?: string;
  sortOrder: number;
};

export type TourItineraryItem = {
  id: string;
  tourId: string;
  itemDate?: string;
  dayLabel?: string;
  timeLabel?: string;
  activity: string;
  location?: string;
  notes?: string;
  isPlaceholder: boolean;
  sortOrder: number;
  sourceType?: string;
  sourceId?: string;
};

export type TourTeamDayKit = {
  id: string;
  tourId: string;
  teamId: string;
  kitDate: string;
  colourLabel: string;
  sortOrder: number;
};


export type SavePublicBetPayload = {
  betId?: string;
  action?: 'create' | 'edit' | 'void';
  marketId?: string;
  optionId: string;
  bettorName?: string;
  stakeAmountPence: number;
  comment?: string;
  editToken?: string;
};

async function postPublicJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => undefined) as { message?: string } | undefined;
  if (!response.ok) throw new Error(data?.message ?? 'Public request failed.');
  return data as T;
}

export type PublicTourInfoResponse = PublicResponse<{
  tour?: Tour;
  rounds: Round[];
  handbookSections: TourHandbookSection[];
  itineraryItems: TourItineraryItem[];
  teamDayKit: TourTeamDayKit[];
  tourTeams: TourTeam[];
}>;

async function fetchPublicJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      detail = text ? `: ${text.slice(0, 240)}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`Public data request failed for ${path} with ${response.status}${detail}`);
  }
  return response.json() as Promise<T>;
}

export const fetchPublicSummary = () => fetchPublicJson<PublicSummaryResponse>('/.netlify/functions/public-summary');
export const fetchPublicScore = () => fetchPublicJson<PublicScoreResponse>('/.netlify/functions/public-score');
export const fetchPublicMatches = () => fetchPublicJson<PublicMatchesResponse>('/.netlify/functions/public-matches');
export const fetchPublicPlayers = () => fetchPublicJson<PublicPlayersResponse>('/.netlify/functions/public-players');
export const fetchPublicBetMarkets = () => fetchPublicJson<PublicBetMarketsResponse>('/.netlify/functions/public-bet-markets');
export const fetchPublicAdvancedStats = () => fetchPublicJson<PublicAdvancedStatsResponse>('/.netlify/functions/public-advanced-stats');
export const fetchPublicTourInfo = () => fetchPublicJson<PublicTourInfoResponse>('/.netlify/functions/public-tour-info');

export type SavePublicBetResponse = { ok: true; bet: Bet; editToken?: string };
export const savePublicBet = (payload: SavePublicBetPayload) => postPublicJson<SavePublicBetResponse>('/.netlify/functions/public-save-bet', payload);
export const editPublicBet = savePublicBet;
export const voidPublicBet = savePublicBet;
