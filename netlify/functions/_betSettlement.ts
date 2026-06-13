import type { SupabaseClient } from '@supabase/supabase-js';
import { runRows } from './_adminSupabase';
import type { BetMarket } from '../../src/lib/types';

type BetRow = Record<string, unknown> & { id: string; option_id: string; stake_amount_pence?: number | string | null; stake_text?: string | null; outcome_status?: string | null };
type OptionRow = { id: string; odds_decimal?: number | string | null };

function stakePence(row: Record<string, unknown>) {
  if (typeof row.stake_amount_pence === 'number' && Number.isFinite(row.stake_amount_pence)) return row.stake_amount_pence;
  if (typeof row.stake_amount_pence === 'string' && row.stake_amount_pence.trim() !== '') return Number(row.stake_amount_pence) || 0;
  if (typeof row.stake_text === 'string') {
    const parsed = Number(row.stake_text.trim().replace(/^£/, ''));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
  }
  return 0;
}

function splitPot(totalPotPence: number, winningBets: BetRow[]) {
  const winningStakeTotal = winningBets.reduce((total, bet) => total + stakePence(bet), 0);
  if (totalPotPence <= 0 || winningStakeTotal <= 0) return new Map<string, number>();
  const rows = winningBets.map((bet) => {
    const id = String(bet.id);
    const raw = (totalPotPence * stakePence(bet)) / winningStakeTotal;
    return { id, payout: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let remaining = totalPotPence - rows.reduce((total, row) => total + row.payout, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const row of rows) {
    if (remaining <= 0) break;
    row.payout += 1;
    remaining -= 1;
  }
  return new Map(rows.map((row) => [row.id, row.payout]));
}

export async function settleBetMarketRows(supabase: SupabaseClient, marketId: string, marketScope: BetMarket['marketScope'], resultOptionId: string) {
  const [bets, options] = await Promise.all([
    runRows<BetRow>(supabase.from('bets').select('*').eq('market_id', marketId).eq('status', 'active'), 'settlement bets'),
    runRows<OptionRow>(supabase.from('bet_options').select('id, odds_decimal').eq('market_id', marketId), 'settlement options'),
  ]);
  const activeStakeBets = bets.filter((bet) => stakePence(bet) > 0 && bet.outcome_status !== 'void');
  const totalPot = activeStakeBets.reduce((total, bet) => total + stakePence(bet), 0);
  const winningBets = activeStakeBets.filter((bet) => String(bet.option_id) === resultOptionId);
  const winningOption = options.find((option) => String(option.id) === resultOptionId);
  const oddsDecimal = typeof winningOption?.odds_decimal === 'number' ? winningOption.odds_decimal : typeof winningOption?.odds_decimal === 'string' ? Number(winningOption.odds_decimal) : null;
  const potPayouts = marketScope === 'general_pot' ? splitPot(totalPot, winningBets) : new Map<string, number>();

  for (const bet of activeStakeBets) {
    const isWinner = String(bet.option_id) === resultOptionId;
    const payout = !isWinner ? 0 : marketScope === 'general_pot' ? (potPayouts.get(String(bet.id)) ?? 0) : (oddsDecimal && Number.isFinite(oddsDecimal) ? Math.round(stakePence(bet) * oddsDecimal) : null);
    const updated = await supabase.from('bets').update({
      outcome_status: isWinner ? 'won' : 'lost',
      payout_amount_pence: payout,
      payout_status: payout && payout > 0 ? 'unpaid' : 'not_applicable',
    }).eq('id', String(bet.id));
    if (updated.error) throw new Error(`update settled bet outcome: ${updated.error.message}`);
  }

  return { totalPotPence: totalPot, settledBetCount: activeStakeBets.length, winningBetCount: winningBets.length };
}
