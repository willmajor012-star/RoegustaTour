import type { SupabaseClient } from '@supabase/supabase-js';
import { earliestClockTime, zonedLocalDateTimeToIso } from '../../src/lib/tourTime';
import { runRows, runSingle } from './_adminSupabase';

type RoundDeadlineRow = {
  id: string;
  tour_id: string;
  round_date: string | null;
  tee_time: string | null;
};

export type RoundMarketDeadline = {
  roundId: string;
  tourId: string;
  closesAt?: string;
  warning?: string;
};

export async function requiredMarketDeadlineForRound(supabase: SupabaseClient, roundId: string): Promise<RoundMarketDeadline> {
  const round = await runSingle<RoundDeadlineRow>(
    supabase.from('rounds').select('id, tour_id, round_date, tee_time').eq('id', roundId).single(),
    'find required market round',
  );
  const [tourRows, matchRows] = await Promise.all([
    runRows<{ timezone: string | null }>(supabase.from('tours').select('timezone').eq('id', round.tour_id).limit(1), 'find tour timezone'),
    runRows<{ tee_time: string | null }>(supabase.from('matches').select('tee_time').eq('round_id', round.id).neq('status', 'void'), 'find first round tee time'),
  ]);
  const firstTeeTime = earliestClockTime([round.tee_time, ...matchRows.map((match) => match.tee_time)]);
  if (!round.round_date) return { roundId, tourId: round.tour_id, warning: 'Set the round date before opening its Bet Punto market.' };
  if (!firstTeeTime) return { roundId, tourId: round.tour_id, warning: 'Set the round or match first tee time before opening its Bet Punto market.' };
  const timezone = tourRows[0]?.timezone || 'Europe/London';
  const closesAt = zonedLocalDateTimeToIso(round.round_date, firstTeeTime, timezone);
  if (!closesAt) return { roundId, tourId: round.tour_id, warning: 'The tour timezone, round date or first tee time is invalid.' };
  return { roundId, tourId: round.tour_id, closesAt };
}

export async function syncRequiredMarketDeadlinesForRound(supabase: SupabaseClient, roundId: string) {
  const deadline = await requiredMarketDeadlineForRound(supabase, roundId);
  const markets = await runRows<{ id: string; status: string }>(
    supabase.from('bet_markets').select('id, status').eq('round_id', roundId).eq('required', true),
    'find required round markets',
  );

  for (const market of markets) {
    if (market.status === 'settled' || market.status === 'void') continue;
    const update = deadline.closesAt
      ? { closes_at: deadline.closesAt }
      : { closes_at: null, status: market.status === 'open' ? 'draft' : market.status };
    const saved = await supabase.from('bet_markets').update(update).eq('id', market.id);
    if (saved.error) throw new Error(`sync required Bet Punto close time: ${saved.error.message}`);
  }
  return deadline;
}
