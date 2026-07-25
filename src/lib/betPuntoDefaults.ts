export type RequiredMarketDay = {
  id: string;
  roundId?: string | null;
};

export type RoundPlayingDay = {
  id: string;
  roundDate?: string | null;
};

export type DailyStakeBet = {
  marketId: string;
  bettorPlayerId?: string | null;
  stakeAmountPence: number;
  active: boolean;
};

export function requiredMarketPlayingDate(
  market: RequiredMarketDay,
  rounds: RoundPlayingDay[],
): string | undefined {
  if (!market.roundId) return undefined;
  return rounds.find((round) => round.id === market.roundId)?.roundDate ?? undefined;
}

export function playerRequiredStakeForPlayingDate(
  playingDate: string,
  playerId: string,
  markets: RequiredMarketDay[],
  rounds: RoundPlayingDay[],
  bets: DailyStakeBet[],
): number {
  const marketIdsForDay = new Set(markets
    .filter((market) => requiredMarketPlayingDate(market, rounds) === playingDate)
    .map((market) => market.id));

  return bets
    .filter((bet) => bet.active && bet.bettorPlayerId === playerId && marketIdsForDay.has(bet.marketId))
    .reduce((total, bet) => total + Math.max(0, Math.round(bet.stakeAmountPence)), 0);
}

export function requiredDailyStakeShortfall(
  minimumStakePence: number,
  playingDate: string,
  playerId: string,
  markets: RequiredMarketDay[],
  rounds: RoundPlayingDay[],
  bets: DailyStakeBet[],
): number {
  return Math.max(0, minimumStakePence - playerRequiredStakeForPlayingDate(playingDate, playerId, markets, rounds, bets));
}
