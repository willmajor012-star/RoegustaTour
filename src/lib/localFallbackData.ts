import {
  betMarkets,
  betOptions,
  bets,
  currentTourId,
  historicalPlayerStats,
  matchParticipants,
  matches,
  playerMatchResults,
  players,
  rounds,
  tours,
  tourPlayers,
  tourTeamMembers,
  tourTeamResults,
  tourTeams,
} from '../data/mockData';
import { calculateMvpLeaderboard, calculatePlayerAdvancedSummaries, calculateTourSummary, type AdvancedStatsData } from './advancedStats';
import { calculateTeamScoreByTour } from './scoring';
import { calculateAllTimePlayerStats } from './stats';
import type { PublicAdvancedStatsResponse, PublicBetMarketsResponse, PublicMatchesResponse, PublicPlayersResponse, PublicScoreResponse, PublicSummaryResponse, PublicTourInfoResponse } from './publicApi';

const currentTour = tours.find((tour) => tour.id === currentTourId) ?? tours[0];
const currentTourRounds = rounds.filter((round) => round.tourId === currentTourId);
const publicMatches = matches.filter((match) => match.tourId === currentTourId && (match.published || match.status === 'complete'));
const publicMatchIds = new Set(publicMatches.map((match) => match.id));

export const localSummaryFallback: Omit<PublicSummaryResponse, 'source'> & { source: 'local-fallback' } = {
  source: 'local-fallback',
  tour: currentTour,
  rounds: currentTourRounds,
  recentResults: publicMatches.filter((match) => match.status === 'complete'),
  openMarkets: betMarkets.filter((market) => market.tourId === currentTourId && market.status === 'open'),
};

export const localScoreFallback: Omit<PublicScoreResponse, 'source'> & { source: 'local-fallback' } = {
  source: 'local-fallback',
  tour: currentTour,
  teams: tourTeams.filter((team) => team.tourId === currentTourId),
  rounds: currentTourRounds,
  matches: publicMatches,
  scores: calculateTeamScoreByTour(currentTourId, tourTeams, rounds, publicMatches),
};

export const localMatchesFallback: Omit<PublicMatchesResponse, 'source'> & { source: 'local-fallback' } = {
  source: 'local-fallback',
  tour: currentTour,
  rounds: currentTourRounds.filter((round) => publicMatches.some((match) => match.roundId === round.id)),
  matches: publicMatches,
  matchParticipants: matchParticipants.filter((participant) => publicMatchIds.has(participant.matchId)),
  players,
  tourTeams: tourTeams.filter((team) => team.tourId === currentTourId),
};

export const localPlayersFallback: Omit<PublicPlayersResponse, 'source'> & { source: 'local-fallback'; stats: ReturnType<typeof calculateAllTimePlayerStats>; toursAttendedByPlayer: Record<string, number> } = {
  source: 'local-fallback',
  players,
  stats: calculateAllTimePlayerStats(players, matches, matchParticipants, historicalPlayerStats),
  toursAttendedByPlayer: Object.fromEntries(players.map((player) => [
    player.id,
    tourPlayers.filter((item) => item.playerId === player.id && item.attending).length + historicalPlayerStats.filter((item) => item.playerId === player.id).length,
  ])),
};

export const localBettingFallback: Omit<PublicBetMarketsResponse, 'source'> & { source: 'local-fallback' } = {
  source: 'local-fallback',
  betMarkets: betMarkets.filter((market) => market.tourId === currentTourId),
  betOptions,
  bets,
};

const advancedData: AdvancedStatsData = {
  players,
  tours,
  tourTeams,
  tourPlayers,
  tourTeamMembers,
  tourTeamResults,
  rounds,
  matches,
  matchParticipants,
  playerMatchResults,
};

export const localAdvancedStatsFallback: Omit<PublicAdvancedStatsResponse, 'source'> & { source: 'local-fallback' } = {
  source: 'local-fallback',
  currentTour,
  ...advancedData,
  tourSummary: calculateTourSummary(currentTourId, advancedData),
  mvpLeaderboard: calculateMvpLeaderboard(currentTourId, advancedData),
  playerSummaries: calculatePlayerAdvancedSummaries(advancedData, currentTourId),
};

export const localTourInfoFallback: Omit<PublicTourInfoResponse, 'source'> & { source: 'local-fallback' } = {
  source: 'local-fallback',
  tour: currentTour,
  rounds: currentTourRounds,
  handbookSections: [],
  itineraryItems: [],
  teamDayKit: [],
  tourTeams: tourTeams.filter((team) => team.tourId === currentTourId),
};
