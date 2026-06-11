import { createServerSupabaseClient } from './_supabase';
import { mapBet } from './_mappers';

type FunctionEvent = { httpMethod: string; body: string | null; headers?: Record<string, string | undefined> };
type FunctionResponse = { statusCode: number; body: string };

type Row = Record<string, unknown>;

type SupabaseSingle<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type SupabaseMany<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

function jsonResponse(statusCode: number, payload: unknown): FunctionResponse {
  return { statusCode, body: JSON.stringify(payload) };
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function parseBody(event: FunctionEvent) {
  try {
    return event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  } catch {
    return null;
  }
}

async function runRows<T = Row>(query: SupabaseMany<T>, label: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? [];
}

async function runSingle<T = Row>(query: SupabaseSingle<T>, label: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: no row returned`);
  return data;
}

export const handler = async (event: FunctionEvent): Promise<FunctionResponse> => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, message: 'Method not allowed.' });
  const body = parseBody(event);
  if (!body) return jsonResponse(400, { ok: false, message: 'Invalid JSON body.' });

  const marketId = optionalString(body.marketId);
  const optionId = optionalString(body.optionId);
  const bettorName = optionalString(body.bettorName);
  const comment = optionalString(body.comment);
  const stakeAmountPence = typeof body.stakeAmountPence === 'number' ? body.stakeAmountPence : Number(body.stakeAmountPence);

  if (!marketId) return jsonResponse(400, { ok: false, message: 'Market is required.' });
  if (!optionId) return jsonResponse(400, { ok: false, message: 'Option is required.' });
  if (!bettorName) return jsonResponse(400, { ok: false, message: 'Bettor name is required.' });
  if (!Number.isInteger(stakeAmountPence) || stakeAmountPence <= 0) return jsonResponse(400, { ok: false, message: 'Stake must be a positive pounds-and-pence amount.' });

  try {
    const supabase = createServerSupabaseClient();
    const markets = await runRows<{ id: string; status: string; closes_at: string | null }>(supabase.from('bet_markets').select('id, status, closes_at').eq('id', marketId).limit(1), 'find bet market');
    if (markets.length === 0) return jsonResponse(404, { ok: false, message: 'Bet market was not found.' });
    if (markets[0].status !== 'open') return jsonResponse(400, { ok: false, message: 'This Bet Punto market is not open for new picks.' });

    const marketCloseTime = markets[0].closes_at ? Date.parse(markets[0].closes_at) : null;
    if (marketCloseTime !== null && Number.isFinite(marketCloseTime) && marketCloseTime <= Date.now()) {
      return jsonResponse(400, { ok: false, message: 'This Bet Punto market has closed for new picks.' });
    }

    const options = await runRows<{ id: string; market_id: string }>(supabase.from('bet_options').select('id, market_id').eq('id', optionId).eq('market_id', marketId).limit(1), 'find bet option');
    if (options.length === 0) return jsonResponse(400, { ok: false, message: 'Option does not belong to this market.' });

    const insertRow = {
      market_id: marketId,
      option_id: optionId,
      bettor_name: bettorName.slice(0, 120),
      stake_text: `£${(stakeAmountPence / 100).toFixed(stakeAmountPence % 100 === 0 ? 0 : 2)}`,
      stake_amount_pence: stakeAmountPence,
      comment: comment?.slice(0, 240) ?? null,
      status: 'active',
      outcome_status: 'pending',
      payout_status: 'not_applicable',
      device_id: event.headers?.['x-nf-client-connection-ip'] ?? null,
    };
    const saved = await runSingle<Row>(supabase.from('bets').insert(insertRow).select('*').single(), 'save public bet');
    return jsonResponse(200, { ok: true, bet: mapBet(saved) });
  } catch (error) {
    console.error('Public bet save failed:', error);
    return jsonResponse(500, { ok: false, message: 'Bet Punto pick could not be saved.' });
  }
};
