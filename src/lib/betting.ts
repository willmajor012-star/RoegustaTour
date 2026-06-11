import type { Bet, BetMarket, BetOption } from './types';

const currencyFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

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

export function penceToPounds(pence: number) {
  return pence / 100;
}

export function formatPenceCurrency(pence?: number | null) {
  if (typeof pence !== 'number' || !Number.isFinite(pence)) return '£0';
  return currencyFormatter.format(penceToPounds(pence));
}

export function getBetStakePence(bet: Pick<Bet, 'stakeAmount' | 'stakeAmountPence' | 'stakeText'>) {
  if (typeof bet.stakeAmountPence === 'number' && Number.isFinite(bet.stakeAmountPence)) return bet.stakeAmountPence;
  if (typeof bet.stakeAmount === 'number' && Number.isFinite(bet.stakeAmount)) return stakeAmountToPence(bet.stakeAmount);
  if (bet.stakeText) {
    const amount = parseStakeAmount(bet.stakeText);
    return amount === null ? 0 : stakeAmountToPence(amount);
  }
  return 0;
}

export function formatStakeCurrency(bet: Pick<Bet, 'stakeAmount' | 'stakeAmountPence' | 'stakeText'>) {
  const pence = getBetStakePence(bet);
  if (pence > 0) return formatPenceCurrency(pence);
  return bet.stakeText ?? '£0';
}

export function getActiveStakeBets(bets: Bet[]) {
  return bets.filter((bet) => bet.status === 'active' && bet.outcomeStatus !== 'void' && getBetStakePence(bet) > 0);
}

export function calculateMarketPotPence(marketId: string, bets: Bet[]) {
  return getActiveStakeBets(bets.filter((bet) => bet.marketId === marketId)).reduce((total, bet) => total + getBetStakePence(bet), 0);
}

function splitPot(totalPot: number, winningBets: Bet[]) {
  const winningStakeTotal = winningBets.reduce((total, bet) => total + getBetStakePence(bet), 0);
  if (totalPot <= 0 || winningStakeTotal <= 0) return new Map<string, number>();

  const payouts = winningBets.map((bet) => {
    const raw = (totalPot * getBetStakePence(bet)) / winningStakeTotal;
    const floor = Math.floor(raw);
    return { id: bet.id, payout: floor, remainder: raw - floor };
  });
  let remainderPence = totalPot - payouts.reduce((total, row) => total + row.payout, 0);
  payouts.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const payout of payouts) {
    if (remainderPence <= 0) break;
    payout.payout += 1;
    remainderPence -= 1;
  }
  return new Map(payouts.map((row) => [row.id, row.payout]));
}

export function calculateIndicativePayouts(market: BetMarket, options: BetOption[], bets: Bet[]) {
  const marketBets = getActiveStakeBets(bets.filter((bet) => bet.marketId === market.id));
  const totalPotPence = marketBets.reduce((total, bet) => total + getBetStakePence(bet), 0);
  const resultOptionId = market.resultOptionId;
  const payouts = new Map<string, number>();
  if (!resultOptionId || market.status !== 'settled') return { totalPotPence, winningStakeTotalPence: 0, payouts };

  if (market.marketScope === 'general_pot') {
    const winningBets = marketBets.filter((bet) => bet.optionId === resultOptionId);
    const split = splitPot(totalPotPence, winningBets);
    for (const bet of marketBets) payouts.set(bet.id, split.get(bet.id) ?? 0);
    return { totalPotPence, winningStakeTotalPence: winningBets.reduce((total, bet) => total + getBetStakePence(bet), 0), payouts };
  }

  const winningOption = options.find((option) => option.id === resultOptionId);
  for (const bet of marketBets) {
    if (bet.optionId !== resultOptionId || typeof winningOption?.oddsDecimal !== 'number') payouts.set(bet.id, 0);
    else payouts.set(bet.id, Math.round(getBetStakePence(bet) * winningOption.oddsDecimal));
  }
  return { totalPotPence, winningStakeTotalPence: marketBets.filter((bet) => bet.optionId === resultOptionId).reduce((total, bet) => total + getBetStakePence(bet), 0), payouts };
}
