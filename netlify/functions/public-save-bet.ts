import { createServerSupabaseClient } from './_supabase';

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

function generateEditToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hashEditToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenMatchesHash(token: string, expectedHash: string) {
  return await hashEditToken(token) === expectedHash;
}

function mapPublicBet(row: Row) {
  return {
    id: String(row.id),
    marketId: String(row.market_id),
    optionId: String(row.option_id),
    bettorName: String(row.bettor_name),
    stakeText: typeof row.stake_text === 'string' ? row.stake_text : undefined,
    stakeAmountPence: typeof row.stake_amount_pence === 'number' ? row.stake_amount_pence : Number(row.stake_amount_pence) || undefined,
    payoutAmountPence: typeof row.payout_amount_pence === 'number' ? row.payout_amount_pence : undefined,
    outcomeStatus: typeof row.outcome_status === 'string' ? row.outcome_status : 'pending',
    payoutStatus: typeof row.payout_status === 'string' ? row.payout_status : 'not_applicable',
    comment: typeof row.comment === 'string' ? row.comment : undefined,
    createdAt: String(row.created_at),
    status: typeof row.status === 'string' ? row.status : 'active',
  };
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

  const betId = optionalString(body.betId);
  const action = optionalString(body.action) ?? 'create';
  const marketId = optionalString(body.marketId);
  const optionId = optionalString(body.optionId);
  const bettorName = optionalString(body.bettorName);
  const comment = optionalString(body.comment);
  const editToken = optionalString(body.editToken);
  const stakeAmountPence = typeof body.stakeAmountPence === 'number' ? body.stakeAmountPence : Number(body.stakeAmountPence);

  if (!['create', 'edit', 'void'].includes(action)) return jsonResponse(400, { ok: false, message: 'Bet action is invalid.' });
  if (!marketId && action === 'create') return jsonResponse(400, { ok: false, message: 'Market is required.' });
  if (!betId && action !== 'create') return jsonResponse(400, { ok: false, message: 'Bet is required.' });
  if (!optionId && action !== 'void') return jsonResponse(400, { ok: false, message: 'Option is required.' });
  if (action !== 'create' && !editToken) return jsonResponse(403, { ok: false, message: 'This Bet Punto pick cannot be changed without its private edit token.' });
  if (action === 'create' && !bettorName) return jsonResponse(400, { ok: false, message: 'Bettor name is required.' });
  if (action !== 'void' && (!Number.isInteger(stakeAmountPence) || stakeAmountPence <= 0)) return jsonResponse(400, { ok: false, message: 'Stake must be a positive pounds-and-pence amount.' });

  try {
    const supabase = createServerSupabaseClient();
    const deviceId = event.headers?.['x-nf-client-connection-ip'] ?? null;
    let effectiveMarketId = marketId;
    let existingBet: Row | null = null;
    if (action !== 'create') {
      const existing = await runRows<Row>(supabase.from('bets').select('*').eq('id', betId).limit(1), 'find public bet');
      if (existing.length === 0) return jsonResponse(404, { ok: false, message: 'Bet was not found.' });
      existingBet = existing[0];
      effectiveMarketId = String(existingBet.market_id);
      const storedEditTokenHash = optionalString(existingBet.public_edit_token_hash);
      if (!storedEditTokenHash) return jsonResponse(403, { ok: false, message: 'This Bet Punto pick does not have public edit access. Ask an admin to change it.' });
      if (!editToken || !(await tokenMatchesHash(editToken, storedEditTokenHash))) return jsonResponse(403, { ok: false, message: 'This Bet Punto pick cannot be changed without its private edit token.' });
      if (String(existingBet.status) !== 'active') return jsonResponse(400, { ok: false, message: 'Only active Bet Punto picks can be changed.' });
    }
    const markets = await runRows<{ id: string; status: string; closes_at: string | null }>(supabase.from('bet_markets').select('id, status, closes_at').eq('id', effectiveMarketId).limit(1), 'find bet market');
    if (markets.length === 0) return jsonResponse(404, { ok: false, message: 'Bet market was not found.' });
    if (markets[0].status !== 'open') return jsonResponse(400, { ok: false, message: 'This Bet Punto market is not open for public bet changes.' });

    const marketCloseTime = markets[0].closes_at ? Date.parse(markets[0].closes_at) : null;
    if (marketCloseTime !== null && Number.isFinite(marketCloseTime) && marketCloseTime <= Date.now()) {
      return jsonResponse(400, { ok: false, message: 'This Bet Punto market has closed for new picks.' });
    }

    if (action === 'void') {
      const saved = await runSingle<Row>(supabase.from('bets').update({ status: 'void', outcome_status: 'void', payout_status: 'not_applicable', payout_amount_pence: null, updated_at: new Date().toISOString(), void_reason: comment?.slice(0, 240) ?? 'Voided by bettor' }).eq('id', betId).select('*').single(), 'void public bet');
      return jsonResponse(200, { ok: true, bet: mapPublicBet(saved) });
    }

    const options = await runRows<{ id: string; market_id: string }>(supabase.from('bet_options').select('id, market_id').eq('id', optionId).eq('market_id', effectiveMarketId).limit(1), 'find bet option');
    if (options.length === 0) return jsonResponse(400, { ok: false, message: 'Option does not belong to this market.' });

    if (action === 'edit') {
      const saved = await runSingle<Row>(supabase.from('bets').update({ option_id: optionId, stake_text: `£${(stakeAmountPence / 100).toFixed(stakeAmountPence % 100 === 0 ? 0 : 2)}`, stake_amount_pence: stakeAmountPence, comment: comment?.slice(0, 240) ?? null, updated_at: new Date().toISOString() }).eq('id', betId).select('*').single(), 'edit public bet');
      return jsonResponse(200, { ok: true, bet: mapPublicBet(saved) });
    }

    const newEditToken = generateEditToken();
    const insertRow = {
      market_id: effectiveMarketId,
      option_id: optionId,
      bettor_name: bettorName!.slice(0, 120),
      stake_text: `£${(stakeAmountPence / 100).toFixed(stakeAmountPence % 100 === 0 ? 0 : 2)}`,
      stake_amount_pence: stakeAmountPence,
      comment: comment?.slice(0, 240) ?? null,
      status: 'active',
      outcome_status: 'pending',
      payout_status: 'not_applicable',
      device_id: deviceId,
      public_edit_token_hash: await hashEditToken(newEditToken),
    };
    const saved = await runSingle<Row>(supabase.from('bets').insert(insertRow).select('*').single(), 'save public bet');
    return jsonResponse(200, { ok: true, bet: mapPublicBet(saved), editToken: newEditToken });
  } catch (error) {
    console.error('Public bet save failed:', error);
    return jsonResponse(500, { ok: false, message: 'Bet Punto pick could not be saved.' });
  }
};
