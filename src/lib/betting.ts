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

export function parseStakeAmount(value: string) {
  const normalized = value.trim().replace(/^£/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function stakeAmountToPence(amount: number) {
  return Math.round(amount * 100);
}

export function formatStakeCurrency(bet: Pick<Bet, 'stakeAmount' | 'stakeAmountPence' | 'stakeText'>) {
  // TODO: Remove stakeText fallback once persisted bets have stakeAmount/stakeAmountPence.
  const amount = bet.stakeAmount ?? (typeof bet.stakeAmountPence === 'number' ? bet.stakeAmountPence / 100 : undefined);
  if (typeof amount === 'number') return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  return bet.stakeText ?? '£0';
}
