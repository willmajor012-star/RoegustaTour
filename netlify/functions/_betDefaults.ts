import type { SupabaseClient } from '@supabase/supabase-js';
import { BET_PUNTO_MINIMUM_STAKE_PENCE, BET_PUNTO_STAKE_INCREMENT_PENCE } from '../../src/lib/betting';
import { requiredDailyStakeShortfall, requiredMarketPlayingDate, type DailyStakeBet, type RequiredMarketDay, type RoundPlayingDay } from '../../src/lib/betPuntoDefaults';
import { runRows } from './_adminSupabase';

type MarketRow = {
  id: string;
  tour_id: string;
  round_id: string | null;
  market_type: string;
  status: string;
  closes_at: string | null;
  required: boolean | null;
  defaults_applied_at: string | null;
};

type PlayerRow = { id: string; display_name: string; active: boolean };
type TourPlayerRow = { player_id: string };
type MemberRow = { player_id: string; team_id: string };
type RoundRow = { id: string; round_date: string | null };
type OptionRow = { id: string; market_id: string; linked_player_id: string | null; linked_team_id: string | null };
type BetRow = { id: string; market_id: string; bettor_player_id: string | null; stake_amount_pence: number | string | null; status: string; outcome_status: string | null; entry_source: string | null };

function stakePence(row: BetRow) {
  const value = typeof row.stake_amount_pence === 'number' ? row.stake_amount_pence : Number(row.stake_amount_pence);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export type AutomaticDefaultResult = {
  dueMarketIds: string[];
  closedMarketIds: string[];
  insertedBetIds: string[];
  updatedBetIds: string[];
  unresolved: Array<{ marketId: string; playerId: string; reason: string }>;
};

export async function resetPendingAutomaticDefaultsForTour(
  supabase: SupabaseClient,
  tourId: string,
) {
  const reset = await supabase
    .from('bet_markets')
    .update({ defaults_applied_at: null })
    .eq('tour_id', tourId)
    .eq('required', true)
    .in('status', ['open', 'closed']);
  if (reset.error) {
    throw new Error(`reset pending automatic Bet Punto defaults: ${reset.error.message}`);
  }
}

export async function applyAutomaticBetDefaultsForTour(
  supabase: SupabaseClient,
  tourId: string,
  now = Date.now(),
  options: { includeSettledMarketId?: string } = {},
): Promise<AutomaticDefaultResult> {
  const nowIso = new Date(now).toISOString();
  const dueCandidates = await runRows<MarketRow>(
    supabase.from('bet_markets')
      .select('id, tour_id, round_id, market_type, status, closes_at, required, defaults_applied_at')
      .eq('tour_id', tourId)
      .eq('required', true)
      .in('status', ['open', 'closed', 'settled'])
      .lte('closes_at', nowIso),
    'find due required Bet Punto markets',
  );
  const dueMarkets = dueCandidates.filter((market) => {
    if (market.status === 'settled' && market.id !== options.includeSettledMarketId) return false;
    return market.status === 'open' || !market.defaults_applied_at || market.id === options.includeSettledMarketId;
  }).sort((left, right) => Date.parse(left.closes_at ?? '') - Date.parse(right.closes_at ?? '') || left.id.localeCompare(right.id));
  const result: AutomaticDefaultResult = { dueMarketIds: dueMarkets.map((market) => market.id), closedMarketIds: [], insertedBetIds: [], updatedBetIds: [], unresolved: [] };
  if (dueMarkets.length === 0) return result;

  const dueMarketIds = dueMarkets.map((market) => market.id);
  const markets = await runRows<MarketRow>(
    supabase.from('bet_markets')
      .select('id, tour_id, round_id, market_type, status, closes_at, required, defaults_applied_at')
      .eq('tour_id', tourId)
      .eq('required', true)
      .in('status', ['open', 'closed', 'settled']),
    'find required Bet Punto markets for daily coverage',
  );
  const requiredMarketIds = markets.map((market) => market.id);
  const roundIds = [...new Set(markets.map((market) => market.round_id).filter((roundId): roundId is string => Boolean(roundId)))];
  const [tourPlayers, memberRows, roundRows, optionRows, persistedBetRows] = await Promise.all([
    runRows<TourPlayerRow>(supabase.from('tour_players').select('player_id').eq('tour_id', tourId).eq('attending', true), 'find automatic-default tour players'),
    runRows<MemberRow>(supabase.from('tour_team_members').select('player_id, team_id').eq('tour_id', tourId), 'find automatic-default team membership'),
    roundIds.length > 0
      ? runRows<RoundRow>(supabase.from('rounds').select('id, round_date').in('id', roundIds), 'find automatic-default playing dates')
      : Promise.resolve([]),
    runRows<OptionRow>(supabase.from('bet_options').select('id, market_id, linked_player_id, linked_team_id').in('market_id', dueMarketIds), 'find automatic-default options'),
    runRows<BetRow>(supabase.from('bets').select('id, market_id, bettor_player_id, stake_amount_pence, status, outcome_status, entry_source').in('market_id', requiredMarketIds).eq('status', 'active'), 'find existing required-market bets'),
  ]);
  const playerIds = tourPlayers.map((row) => row.player_id);
  const players = playerIds.length > 0
    ? await runRows<PlayerRow>(supabase.from('players').select('id, display_name, active').in('id', playerIds), 'find automatic-default player names')
    : [];
  const activePlayers = players.filter((player) => player.active);
  const teamByPlayer = new Map(memberRows.map((member) => [member.player_id, member.team_id]));
  const requiredMarkets: RequiredMarketDay[] = markets.map((market) => ({ id: market.id, roundId: market.round_id }));
  const playingRounds: RoundPlayingDay[] = roundRows.map((round) => ({ id: round.id, roundDate: round.round_date }));
  const dailyBets: DailyStakeBet[] = persistedBetRows
    .filter((bet) => bet.outcome_status !== 'void')
    .map((bet) => ({
      marketId: bet.market_id,
      bettorPlayerId: bet.bettor_player_id,
      stakeAmountPence: stakePence(bet),
      active: bet.status === 'active',
    }));

  for (const market of dueMarkets) {
    const unresolvedBefore = result.unresolved.length;
    const marketOptions = optionRows.filter((option) => option.market_id === market.id);
    const playingDate = requiredMarketPlayingDate({ id: market.id, roundId: market.round_id }, playingRounds);
    if (!playingDate) {
      for (const player of activePlayers) {
        result.unresolved.push({ marketId: market.id, playerId: player.id, reason: 'The linked round has no playing date.' });
      }
      continue;
    }
    for (const player of activePlayers) {
      const shortfall = requiredDailyStakeShortfall(
        BET_PUNTO_MINIMUM_STAKE_PENCE,
        playingDate,
        player.id,
        requiredMarkets,
        playingRounds,
        dailyBets,
      );
      if (shortfall <= 0) continue;

      const targetOption = market.market_type === 'player_performance'
        ? marketOptions.find((option) => option.linked_player_id === player.id)
        : market.market_type === 'team_result'
          ? marketOptions.find((option) => option.linked_team_id === teamByPlayer.get(player.id))
          : undefined;
      if (!targetOption) {
        result.unresolved.push({ marketId: market.id, playerId: player.id, reason: market.market_type === 'team_result' ? 'No option matches the player’s tour team.' : 'No self option exists for this player.' });
        continue;
      }

      const stakeAmountPence = Math.ceil(shortfall / BET_PUNTO_STAKE_INCREMENT_PENCE) * BET_PUNTO_STAKE_INCREMENT_PENCE;
      const existingAutomatic = persistedBetRows.find((bet) => bet.market_id === market.id
        && bet.bettor_player_id === player.id
        && bet.entry_source === 'automatic_default'
        && bet.status === 'active'
        && bet.outcome_status !== 'void');
      if (existingAutomatic) {
        const nextStakeAmountPence = stakePence(existingAutomatic) + stakeAmountPence;
        const updated = await supabase.from('bets').update({
          stake_text: `£${(nextStakeAmountPence / 100).toFixed(0)}`,
          stake_amount_pence: nextStakeAmountPence,
          comment: 'Automatic daily minimum top-up at first tee',
          updated_at: new Date(now).toISOString(),
        }).eq('id', existingAutomatic.id);
        if (updated.error) throw new Error(`update automatic Bet Punto default: ${updated.error.message}`);
        existingAutomatic.stake_amount_pence = nextStakeAmountPence;
        result.updatedBetIds.push(existingAutomatic.id);
        dailyBets.push({
          marketId: market.id,
          bettorPlayerId: player.id,
          stakeAmountPence,
          active: true,
        });
        continue;
      }

      const betId = crypto.randomUUID();
      const inserted = await supabase.from('bets').insert({
        id: betId,
        market_id: market.id,
        option_id: targetOption.id,
        bettor_name: player.display_name.slice(0, 120),
        bettor_player_id: player.id,
        stake_text: `£${(stakeAmountPence / 100).toFixed(0)}`,
        stake_amount_pence: stakeAmountPence,
        comment: shortfall < BET_PUNTO_MINIMUM_STAKE_PENCE ? 'Automatic daily minimum top-up at first tee' : 'Automatic daily default at first tee',
        admin_entered: true,
        entry_source: 'automatic_default',
        admin_notes: market.market_type === 'team_result' ? 'Automatic daily-minimum default to own team at the fixed market close.' : 'Automatic daily-minimum default to self at the fixed market close.',
        status: 'active',
        outcome_status: 'pending',
        payout_status: 'not_applicable',
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      });
      if (inserted.error) {
        if (/duplicate key|bets_one_active_automatic_default_idx/i.test(inserted.error.message)) {
          const concurrentDefaults = await runRows<BetRow>(
            supabase.from('bets')
              .select('id, market_id, bettor_player_id, stake_amount_pence, status, outcome_status, entry_source')
              .eq('market_id', market.id)
              .eq('bettor_player_id', player.id)
              .eq('entry_source', 'automatic_default')
              .eq('status', 'active')
              .limit(1),
            'load concurrently created automatic Bet Punto default',
          );
          const concurrentStakePence = concurrentDefaults[0] ? stakePence(concurrentDefaults[0]) : 0;
          if (concurrentStakePence > 0) {
            dailyBets.push({
              marketId: market.id,
              bettorPlayerId: player.id,
              stakeAmountPence: concurrentStakePence,
              active: true,
            });
            continue;
          }
          result.unresolved.push({
            marketId: market.id,
            playerId: player.id,
            reason: 'A concurrent automatic default could not be reconciled.',
          });
          continue;
        }
        throw new Error(`add automatic Bet Punto default: ${inserted.error.message}`);
      }
      result.insertedBetIds.push(betId);
      dailyBets.push({
        marketId: market.id,
        bettorPlayerId: player.id,
        stakeAmountPence,
        active: true,
      });
    }

    const fullyApplied = result.unresolved.length === unresolvedBefore;
    const marketUpdate = {
      ...(market.status === 'open' ? { status: 'closed' } : {}),
      ...(fullyApplied ? { defaults_applied_at: nowIso } : {}),
    };
    const saved = await supabase.from('bet_markets').update(marketUpdate).eq('id', market.id);
    if (saved.error) throw new Error(`finalise required Bet Punto market cutoff: ${saved.error.message}`);
    if (market.status === 'open') result.closedMarketIds.push(market.id);
  }

  return result;
}

export async function applyAutomaticBetDefaultsForMarket(supabase: SupabaseClient, marketId: string, now = Date.now()) {
  const markets = await runRows<{ tour_id: string }>(supabase.from('bet_markets').select('tour_id').eq('id', marketId).limit(1), 'find automatic-default market tour');
  if (markets.length === 0) throw new Error('Automatic-default market does not exist.');
  const result = await applyAutomaticBetDefaultsForTour(supabase, markets[0].tour_id, now, { includeSettledMarketId: marketId });
  return { ...result, unresolved: result.unresolved.filter((row) => row.marketId === marketId) };
}
