import type { AdvancedStatsData, MvpLeaderboardRow, PlayerAdvancedSummary, TourSummary } from './advancedStats';
import type { Bet, BetMarket, BetOption, CourseGuide, Match, MatchParticipant, Player, Round, RoundPrizeResult, TeamScoreRow, Tour, TourPlayer, TourTeam, TourTeamMember } from './types';

export type PublicDataSource = 'supabase';
export type PublicResponse<T> = T & { source: PublicDataSource };

export type PublicSummaryResponse = PublicResponse<{
  tour?: Tour;
  rounds: Round[];
  recentResults: Match[];
  openMarkets: BetMarket[];
  tourCourses: CourseGuide[];
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
  roundPrizeResults: RoundPrizeResult[];
  tourCourses: CourseGuide[];
}>;

export type PublicDashboardResponse = PublicMatchesResponse & {
  recentResults: Match[];
  openMarkets: BetMarket[];
  scores: TeamScoreRow[];
};

export type PublicTourHeaderResponse = PublicResponse<{ tour?: Tour }>;

export type PublicPlayersResponse = PublicResponse<{
  players: Player[];
}>;

export type PublicCoursesResponse = PublicResponse<{
  tour?: Tour;
  rounds: Round[];
  tourCourses: CourseGuide[];
}>;

export type PublicBetMarketsResponse = PublicResponse<{
  tour?: Tour;
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
  players: Player[];
  roundPrizeResults: RoundPrizeResult[];
}>;

const publicResponseCache = new Map<string, { expiresAt: number; value: unknown }>();
const publicRequestsInFlight = new Map<string, Promise<unknown>>();
const PUBLIC_RESPONSE_CACHE_MS = 4_000;

export function clearPublicDataCache() {
  publicResponseCache.clear();
}

async function fetchPublicJson<T>(path: string): Promise<T> {
  const cached = publicResponseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const pending = publicRequestsInFlight.get(path);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
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
    const value = await response.json() as T;
    publicResponseCache.set(path, { expiresAt: Date.now() + PUBLIC_RESPONSE_CACHE_MS, value });
    return value;
  })();
  publicRequestsInFlight.set(path, request);
  try {
    return await request;
  } finally {
    publicRequestsInFlight.delete(path);
  }
}

export const fetchPublicDashboard = () => fetchPublicJson<PublicDashboardResponse>('/.netlify/functions/public-dashboard');
export const fetchPublicTourHeader = () => fetchPublicJson<PublicTourHeaderResponse>('/.netlify/functions/public-tour-header');
export const fetchPublicSummary = () => fetchPublicJson<PublicSummaryResponse>('/.netlify/functions/public-summary');
export const fetchPublicScore = () => fetchPublicJson<PublicScoreResponse>('/.netlify/functions/public-score');
export const fetchPublicMatches = () => fetchPublicJson<PublicMatchesResponse>('/.netlify/functions/public-matches');
export const fetchPublicPlayers = () => fetchPublicJson<PublicPlayersResponse>('/.netlify/functions/public-players');
export const fetchPublicCourses = () => fetchPublicJson<PublicCoursesResponse>('/.netlify/functions/public-courses');
export const fetchPublicBetMarkets = () => fetchPublicJson<PublicBetMarketsResponse>('/.netlify/functions/public-bet-markets');
export const fetchPublicAdvancedStats = () => fetchPublicJson<PublicAdvancedStatsResponse>('/.netlify/functions/public-advanced-stats');
export const fetchPublicTourInfo = () => fetchPublicJson<PublicTourInfoResponse>('/.netlify/functions/public-tour-info');

export type SavePublicBetResponse = { ok: true; bet: Bet; editToken?: string };
export const savePublicBet = (payload: SavePublicBetPayload) => postPublicJson<SavePublicBetResponse>('/.netlify/functions/public-save-bet', payload);
export const editPublicBet = savePublicBet;
export const voidPublicBet = savePublicBet;
