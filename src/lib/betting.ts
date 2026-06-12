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


export type BetPuntoMarketSummary = {
  market: BetMarket;
  totalBets: number;
  totalStakePence: number;
  settledPayoutPence: number;
  missingBettorNames: string[];
};

export type BetPuntoBettorSummary = {
  bettorName: string;
  totalBets: number;
  totalStakePence: number;
  settledPayoutPence: number;
  netPence: number;
  won: number;
  lost: number;
  pending: number;
  void: number;
  push: number;
  missingStablefordPicks: number;
};

function normalizedName(name: string) {
  return name.trim().toLowerCase();
}

function isStablefordMarket(market: BetMarket) {
  return market.status !== 'void' && market.marketType === 'player_performance' && market.title.toLowerCase().includes('stableford');
}

export function getActiveBetsForMarket(marketId: string, bets: Bet[]) {
  return bets.filter((bet) => bet.marketId === marketId && bet.status === 'active');
}

export function calculateMarketPayoutMap(markets: BetMarket[], options: BetOption[], bets: Bet[]) {
  const payoutMap = new Map<string, number>();
  for (const market of markets) {
    const summary = calculateIndicativePayouts(market, options.filter((option) => option.marketId === market.id), bets);
    for (const [betId, payoutPence] of summary.payouts) payoutMap.set(betId, payoutPence);
  }
  return payoutMap;
}

export function buildBetPuntoMarketSummaries(markets: BetMarket[], options: BetOption[], bets: Bet[], mandatoryBettorNames: string[] = []): BetPuntoMarketSummary[] {
  const mandatoryNamesByKey = new Map(mandatoryBettorNames.map((name) => [normalizedName(name), name]));
  return markets.map((market) => {
    const activeMarketBets = getActiveBetsForMarket(market.id, bets);
    const backedKeys = new Set(activeMarketBets.map((bet) => normalizedName(bet.bettorName)));
    const payoutSummary = calculateIndicativePayouts(market, options.filter((option) => option.marketId === market.id), bets);
    return {
      market,
      totalBets: activeMarketBets.length,
      totalStakePence: activeMarketBets.reduce((total, bet) => total + getBetStakePence(bet), 0),
      settledPayoutPence: [...payoutSummary.payouts.values()].reduce((total, payout) => total + payout, 0),
      missingBettorNames: isStablefordMarket(market) ? [...mandatoryNamesByKey].filter(([key]) => !backedKeys.has(key)).map(([, name]) => name) : [],
    };
  });
}

export function buildBetPuntoBettorSummaries(markets: BetMarket[], options: BetOption[], bets: Bet[], mandatoryBettorNames: string[] = []): BetPuntoBettorSummary[] {
  const marketById = new Map(markets.map((market) => [market.id, market]));
  const payoutMap = calculateMarketPayoutMap(markets, options, bets);
  const stablefordMarkets = markets.filter(isStablefordMarket);
  const summaryByKey = new Map<string, BetPuntoBettorSummary>();
  const displayNameByKey = new Map<string, string>();

  const ensureSummary = (name: string) => {
    const key = normalizedName(name);
    const displayName = displayNameByKey.get(key) ?? name.trim();
    displayNameByKey.set(key, displayName);
    const existing = summaryByKey.get(key);
    if (existing) return existing;
    const next: BetPuntoBettorSummary = { bettorName: displayName, totalBets: 0, totalStakePence: 0, settledPayoutPence: 0, netPence: 0, won: 0, lost: 0, pending: 0, void: 0, push: 0, missingStablefordPicks: 0 };
    summaryByKey.set(key, next);
    return next;
  };

  for (const name of mandatoryBettorNames) ensureSummary(name);

  for (const bet of bets) {
    const summary = ensureSummary(bet.bettorName);
    if (bet.status === 'void' || bet.outcomeStatus === 'void') {
      summary.void += 1;
      continue;
    }
    summary.totalBets += 1;
    summary.totalStakePence += getBetStakePence(bet);
    if (bet.outcomeStatus === 'won') summary.won += 1;
    else if (bet.outcomeStatus === 'lost') summary.lost += 1;
    else if (bet.outcomeStatus === 'push') summary.push += 1;
    else summary.pending += 1;

    const market = marketById.get(bet.marketId);
    const settledPayout = market?.status === 'settled' ? (bet.payoutAmountPence ?? payoutMap.get(bet.id) ?? 0) : 0;
    summary.settledPayoutPence += settledPayout;
  }

  for (const [key, summary] of summaryByKey) {
    const backedStablefordMarketIds = new Set(bets.filter((bet) => normalizedName(bet.bettorName) === key && bet.status === 'active').map((bet) => bet.marketId));
    summary.missingStablefordPicks = stablefordMarkets.filter((market) => !backedStablefordMarketIds.has(market.id)).length;
    summary.netPence = summary.settledPayoutPence - summary.totalStakePence;
  }

  return [...summaryByKey.values()].sort((a, b) => b.totalStakePence - a.totalStakePence || a.bettorName.localeCompare(b.bettorName));
}
