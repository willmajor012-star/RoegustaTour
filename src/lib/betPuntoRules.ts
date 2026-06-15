import type { Bet, BetMarket, BetOption, Match, Round, TourPlayer, Player, TourTeam, TourTeamMember } from './types';

export function normalizeMarketTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sameNullableId(left?: string | null, right?: string | null) {
  return (left || null) === (right || null);
}

export function isExactDuplicateOpenMarket(candidate: Pick<BetMarket, 'tourId' | 'marketScope' | 'title' | 'roundId' | 'matchId'>, existing: Pick<BetMarket, 'id' | 'tourId' | 'marketScope' | 'title' | 'roundId' | 'matchId' | 'status'>, excludeMarketId?: string | null) {
  if (excludeMarketId && existing.id === excludeMarketId) return false;
  return existing.status === 'open'
    && existing.tourId === candidate.tourId
    && existing.marketScope === candidate.marketScope
    && normalizeMarketTitle(existing.title) === normalizeMarketTitle(candidate.title)
    && sameNullableId(existing.roundId, candidate.roundId)
    && sameNullableId(existing.matchId, candidate.matchId);
}

export function betMarketActualBetCount(marketId: string, bets: Pick<Bet, 'marketId'>[]) {
  return bets.filter((bet) => bet.marketId === marketId).length;
}

export type MarketVisibilityWarning = { marketId: string; reason: string };

export function betMarketVisibilityWarning(
  market: BetMarket,
  options: BetOption[],
  context: {
    roundIds: Set<string>;
    matchIds: Set<string>;
    playerIds: Set<string>;
    teamIds: Set<string>;
  },
): MarketVisibilityWarning | null {
  const marketOptions = options.filter((option) => option.marketId === market.id);
  if (market.roundId && !context.roundIds.has(market.roundId)) return { marketId: market.id, reason: 'Linked round is not public/valid for Bet Punto.' };
  if (market.matchId && !context.matchIds.has(market.matchId)) return { marketId: market.id, reason: 'Linked match is not public/valid for Bet Punto.' };
  if (marketOptions.length === 0) return { marketId: market.id, reason: 'Market has no options.' };
  const invalidOption = marketOptions.find((option) => (option.linkedPlayerId && !context.playerIds.has(option.linkedPlayerId)) || (option.linkedTeamId && !context.teamIds.has(option.linkedTeamId)));
  if (invalidOption?.linkedPlayerId) return { marketId: market.id, reason: `Option "${invalidOption.label}" links to a player outside the current public tour.` };
  if (invalidOption?.linkedTeamId) return { marketId: market.id, reason: `Option "${invalidOption.label}" links to a team outside the current public tour.` };
  return null;
}

export function visibleBetMarkets(
  markets: BetMarket[],
  options: BetOption[],
  context: {
    roundIds: Set<string>;
    matchIds: Set<string>;
    playerIds: Set<string>;
    teamIds: Set<string>;
  },
) {
  const visibleStatuses: BetMarket['status'][] = ['open', 'closed', 'settled', 'void'];
  return markets.filter((market) => visibleStatuses.includes(market.status) && !betMarketVisibilityWarning(market, options, context));
}

export function publicBetPuntoPlayerIds(players: Player[], tourPlayers: TourPlayer[]) {
  const activePlayerIds = new Set(players.filter((player) => player.active).map((player) => player.id));
  return new Set(tourPlayers.filter((tourPlayer) => tourPlayer.attending && activePlayerIds.has(tourPlayer.playerId)).map((tourPlayer) => tourPlayer.playerId));
}

export function publicBetPuntoTeamIds(teams: TourTeam[], members: TourTeamMember[]) {
  const memberTeamIds = new Set(members.map((member) => member.teamId));
  return new Set(teams.filter((team) => team.published || memberTeamIds.has(team.id)).map((team) => team.id));
}

export function publicBetPuntoMatchIds(matches: Match[]) {
  return new Set(matches.map((match) => match.id));
}

export function publicBetPuntoRoundIds(rounds: Round[]) {
  return new Set(rounds.map((round) => round.id));
}
