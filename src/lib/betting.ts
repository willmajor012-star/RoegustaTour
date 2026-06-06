import type { Bet, BetMarket, BetOption } from './types';

export function getBetsForMarket(marketId: string, bets: Bet[]) {
  return bets.filter((bet) => bet.marketId === marketId && bet.status === 'active');
}

export function getOptionsForMarket(marketId: string, options: BetOption[]) {
  return options.filter((option) => option.marketId === marketId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function groupMarketsByStatus(markets: BetMarket[]) {
  return {
    open: markets.filter((market) => market.status === 'open'),
    closed: markets.filter((market) => market.status === 'closed'),
    settled: markets.filter((market) => market.status === 'settled'),
  };
}
