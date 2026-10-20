import type { SupabaseClient } from '@supabase/supabase-js';
import { BET_PUNTO_MINIMUM_STAKE_PENCE, BET_PUNTO_STAKE_INCREMENT_PENCE } from '../../src/lib/betting';
import { runRows } from './_adminSupabase';

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
  const { data, error } = await supabase.rpc('apply_bet_defaults_atomic', {
    p_tour_id: tourId,
    p_now: new Date(now).toISOString(),
    p_include_settled_market_id: options.includeSettledMarketId ?? null,
    p_minimum: BET_PUNTO_MINIMUM_STAKE_PENCE,
    p_increment: BET_PUNTO_STAKE_INCREMENT_PENCE,
  });
  if (error) throw new Error(`apply automatic Bet Punto defaults atomically: ${error.message}`);
  return data as AutomaticDefaultResult;
}

export async function applyAutomaticBetDefaultsForMarket(supabase: SupabaseClient, marketId: string, now = Date.now()) {
  const markets = await runRows<{ tour_id: string }>(supabase.from('bet_markets').select('tour_id').eq('id', marketId).limit(1), 'find automatic-default market tour');
  if (markets.length === 0) throw new Error('Automatic-default market does not exist.');
  const result = await applyAutomaticBetDefaultsForTour(supabase, markets[0].tour_id, now, { includeSettledMarketId: marketId });
  return { ...result, unresolved: result.unresolved.filter((row) => row.marketId === marketId) };
}
