import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function deriveWinningSide(pointsSideA, pointsSideB) {
  if (pointsSideA > pointsSideB) return 'A';
  if (pointsSideB > pointsSideA) return 'B';
  return 'halved';
}

function splitGeneralPot(totalPotPence, winningBets) {
  const winningStakeTotal = winningBets.reduce((total, bet) => total + bet.stakePence, 0);
  if (totalPotPence <= 0 || winningStakeTotal <= 0) return new Map();
  const rows = winningBets.map((bet) => {
    const raw = (totalPotPence * bet.stakePence) / winningStakeTotal;
    return { id: bet.id, payout: Math.floor(raw), remainder: raw - Math.floor(raw) };
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

function normalizeBettorName(value) {
  return value.trim().toLowerCase();
}

function isDuplicateActivePick(existingBets, bettorName, deviceId) {
  const normalizedBettor = normalizeBettorName(bettorName);
  return existingBets.some((bet) => normalizeBettorName(bet.bettorName) === normalizedBettor || (deviceId && bet.deviceId === deviceId));
}

function mapPublicBetRow(row) {
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

describe('result entry result derivation', () => {
  it('derives side A, side B, and halved winners from points', () => {
    assert.equal(deriveWinningSide(2, 1), 'A');
    assert.equal(deriveWinningSide(0, 3), 'B');
    assert.equal(deriveWinningSide(1.5, 1.5), 'halved');
  });
});

describe('Bet Punto payout and duplicate rules', () => {
  it('splits the general pot exactly across winning stakes', () => {
    const payouts = splitGeneralPot(1001, [
      { id: 'a', stakePence: 100 },
      { id: 'b', stakePence: 200 },
    ]);

    assert.equal(payouts.get('a'), 334);
    assert.equal(payouts.get('b'), 667);
    assert.equal([...payouts.values()].reduce((total, payout) => total + payout, 0), 1001);
  });

  it('blocks duplicate active picks by bettor name or device id', () => {
    const activeBets = [{ bettorName: 'Rosie', deviceId: 'device-1' }];
    assert.equal(isDuplicateActivePick(activeBets, ' rosie ', null), true);
    assert.equal(isDuplicateActivePick(activeBets, 'Different', 'device-1'), true);
    assert.equal(isDuplicateActivePick(activeBets, 'Different', 'device-2'), false);
  });
});

describe('public Bet Punto mapper', () => {
  it('omits device id, payout notes, and other admin-only ledger fields', () => {
    const mapped = mapPublicBetRow({
      id: 'bet-1',
      market_id: 'market-1',
      option_id: 'option-1',
      bettor_name: 'Captain',
      stake_text: '£5',
      stake_amount_pence: 500,
      payout_amount_pence: 1250,
      outcome_status: 'won',
      payout_status: 'unpaid',
      comment: 'Going for it',
      device_id: 'secret-device',
      payout_notes: 'admin-only note',
      created_at: '2026-06-13T00:00:00Z',
      status: 'active',
    });

    assert.deepEqual(Object.keys(mapped).sort(), [
      'bettorName',
      'comment',
      'createdAt',
      'id',
      'marketId',
      'optionId',
      'outcomeStatus',
      'payoutAmountPence',
      'payoutStatus',
      'stakeAmountPence',
      'stakeText',
      'status',
    ]);
    assert.equal('deviceId' in mapped, false);
    assert.equal('payoutNotes' in mapped, false);
  });
});

describe('Bet Punto market lifecycle rules', () => {
  function normalizeMarketTitle(title) {
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function isExactDuplicateOpenMarket(candidate, existing, excludeMarketId = null) {
    if (excludeMarketId && existing.id === excludeMarketId) return false;
    return existing.status === 'open'
      && existing.tourId === candidate.tourId
      && existing.marketScope === candidate.marketScope
      && normalizeMarketTitle(existing.title) === normalizeMarketTitle(candidate.title)
      && (existing.roundId || null) === (candidate.roundId || null)
      && (existing.matchId || null) === (candidate.matchId || null);
  }
  function visibilityWarning(market, options, context) {
    const marketOptions = options.filter((option) => option.marketId === market.id);
    if (market.roundId && !context.roundIds.has(market.roundId)) return 'round';
    if (market.matchId && !context.matchIds.has(market.matchId)) return 'match';
    if (marketOptions.length === 0) return 'options';
    const invalidOption = marketOptions.find((option) => (option.linkedPlayerId && !context.playerIds.has(option.linkedPlayerId)) || (option.linkedTeamId && !context.teamIds.has(option.linkedTeamId)));
    if (invalidOption?.linkedPlayerId) return 'player';
    if (invalidOption?.linkedTeamId) return 'team';
    return null;
  }
  function deletableMarketBetCount(marketId, bets) {
    return bets.filter((bet) => bet.marketId === marketId).length;
  }
  function visibleMarkets(markets, options, context) {
    const visibleStatuses = ['open', 'closed', 'settled'];
    return markets.filter((market) => visibleStatuses.includes(market.status) && !visibilityWarning(market, options, context));
  }

  it('allows same-title open markets for different rounds', () => {
    const existing = { id: 'm1', tourId: 't1', marketScope: 'general_pot', title: 'Stableford winner', roundId: 'r1', matchId: null, status: 'open' };
    const candidate = { tourId: 't1', marketScope: 'general_pot', title: ' stableford   winner ', roundId: 'r2', matchId: null };
    assert.equal(isExactDuplicateOpenMarket(candidate, existing), false);
  });

  it('blocks exact duplicate open markets only', () => {
    const existing = { id: 'm1', tourId: 't1', marketScope: 'general_pot', title: 'Stableford winner', roundId: 'r1', matchId: null, status: 'open' };
    const candidate = { tourId: 't1', marketScope: 'general_pot', title: ' stableford   winner ', roundId: 'r1', matchId: null };
    assert.equal(isExactDuplicateOpenMarket(candidate, existing), true);
    assert.equal(isExactDuplicateOpenMarket(candidate, { ...existing, status: 'closed' }), false);
  });

  it('uses actual bet rows, not options, to decide hard-delete eligibility', () => {
    assert.equal(deletableMarketBetCount('m1', []), 0);
    assert.equal(deletableMarketBetCount('m1', [{ id: 'b1', marketId: 'm1' }]), 1);
  });

  it('keeps only open, closed, and settled markets visible when references and options are valid', () => {
    const context = { roundIds: new Set(['r1']), matchIds: new Set(['match1']), playerIds: new Set(['p1']), teamIds: new Set(['team1']) };
    const markets = ['open', 'closed', 'settled', 'void'].map((status) => ({ id: `m-${status}`, status, roundId: 'r1', matchId: null }));
    const options = markets.map((market) => ({ id: `o-${market.status}`, marketId: market.id, linkedPlayerId: 'p1' }));
    assert.deepEqual(visibleMarkets(markets, options, context).map((market) => market.status), ['open', 'closed', 'settled']);
  });

  it('warns when a public market is missing valid options or linked data', () => {
    const context = { roundIds: new Set(['r1']), matchIds: new Set(), playerIds: new Set(['p1']), teamIds: new Set() };
    assert.equal(visibilityWarning({ id: 'm1', status: 'open', roundId: 'r2' }, [{ id: 'o1', marketId: 'm1' }], context), 'round');
    assert.equal(visibilityWarning({ id: 'm2', status: 'open', roundId: 'r1' }, [], context), 'options');
    assert.equal(visibilityWarning({ id: 'm3', status: 'open', roundId: 'r1' }, [{ id: 'o3', marketId: 'm3', linkedPlayerId: 'missing' }], context), 'player');
  });
});
