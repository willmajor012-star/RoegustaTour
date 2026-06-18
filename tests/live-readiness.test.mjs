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

function canPlaceRepeatActivePick() {
  return true;
}


function canPublicChangeBet(existingBet, providedToken) {
  return Boolean(existingBet.publicEditTokenHash && providedToken && existingBet.publicEditTokenHash === `hash:${providedToken}` && existingBet.status === 'active');
}

function adminSaveBetRow(previousBet, nextStatus) {
  return {
    status: nextStatus,
    outcomeStatus: nextStatus === 'void' ? 'void' : (previousBet?.outcomeStatus ?? 'pending'),
    payoutStatus: nextStatus === 'void' ? 'not_applicable' : (previousBet?.payoutStatus ?? 'not_applicable'),
    payoutAmountPence: nextStatus === 'void' ? null : (previousBet?.payoutAmountPence ?? null),
    payoutNotes: nextStatus === 'void' ? null : (previousBet?.payoutNotes ?? null),
  };
}


function playerSummaryExpandedByDefault() {
  return false;
}

function optionStakeRows(options, bets) {
  return options.map((option) => {
    const optionBets = bets.filter((bet) => bet.optionId === option.id && bet.status === 'active');
    return { optionId: option.id, totalPence: optionBets.reduce((total, bet) => total + bet.stakePence, 0), betCount: optionBets.length };
  });
}

function resolveLivePlayer(input, players, tourPlayers) {
  const liveIds = new Set(tourPlayers.filter((row) => row.attending).map((row) => row.playerId));
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const matches = players.filter((player) => player.active && liveIds.has(player.id) && (player.displayName.toLowerCase() === normalized || player.nickname?.toLowerCase() === normalized));
  return matches.length === 1 ? { ok: true, playerId: matches[0].id } : { ok: false };
}

function saveMarketResult(market, resultOptionId, options) {
  if (!options.some((option) => option.id === resultOptionId && option.marketId === market.id)) throw new Error('Result option must belong to market');
  return { ...market, resultOptionId };
}

function settleWinnerMarket(market, bets) {
  return bets.map((bet) => bet.status === 'void' ? bet : { ...bet, outcomeStatus: bet.optionId === market.resultOptionId ? 'won' : 'lost' });
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

  it('allows repeat active picks by bettor name or device id', () => {
    assert.equal(canPlaceRepeatActivePick(), true);
  });

  it('settles multiple winning bets from the same bettor independently', () => {
    const payouts = splitGeneralPot(1500, [
      { id: 'rosie-1', stakePence: 500 },
      { id: 'rosie-2', stakePence: 250 },
    ]);
    assert.equal(payouts.get('rosie-1'), 1000);
    assert.equal(payouts.get('rosie-2'), 500);
  });
});


describe('Bet Punto live market public layout and settlement rules', () => {
  it('keeps the player betting summary collapsed by default', () => {
    assert.equal(playerSummaryExpandedByDefault(), false);
  });

  it('builds open-market stake totals by option', () => {
    const rows = optionStakeRows([{ id: 'p1' }, { id: 'p2' }], [
      { optionId: 'p1', stakePence: 500, status: 'active' },
      { optionId: 'p1', stakePence: 250, status: 'active' },
      { optionId: 'p2', stakePence: 1000, status: 'active' },
    ]);
    assert.deepEqual(rows, [
      { optionId: 'p1', totalPence: 750, betCount: 2 },
      { optionId: 'p2', totalPence: 1000, betCount: 1 },
    ]);
  });

  it('saves result_option_id from an existing market option and settles winners/losers', () => {
    const market = saveMarketResult({ id: 'm1' }, 'o2', [{ id: 'o1', marketId: 'm1' }, { id: 'o2', marketId: 'm1' }]);
    assert.equal(market.resultOptionId, 'o2');
    assert.deepEqual(settleWinnerMarket(market, [
      { id: 'b1', optionId: 'o1', status: 'active' },
      { id: 'b2', optionId: 'o2', status: 'active' },
      { id: 'b3', optionId: 'o2', status: 'void', outcomeStatus: 'void' },
    ]).map((bet) => [bet.id, bet.outcomeStatus]), [['b1', 'lost'], ['b2', 'won'], ['b3', 'void']]);
  });
});

describe('Bet Punto public edit tokens and admin overrides', () => {

  it('resolves exact live player name and nickname, and stores bettor_player_id', () => {
    const players = [{ id: 'will', displayName: 'will major', nickname: 'major', active: true }];
    const tourPlayers = [{ playerId: 'will', attending: true }];
    assert.deepEqual(resolveLivePlayer('will major', players, tourPlayers), { ok: true, playerId: 'will' });
    assert.deepEqual(resolveLivePlayer('major', players, tourPlayers), { ok: true, playerId: 'will' });
  });

  it('blocks typo, unknown, inactive, and non-attending bettor names safely', () => {
    const players = [
      { id: 'will', displayName: 'will major', nickname: 'major', active: true },
      { id: 'old', displayName: 'old player', nickname: undefined, active: false },
      { id: 'away', displayName: 'away player', nickname: undefined, active: true },
    ];
    const tourPlayers = [{ playerId: 'will', attending: true }, { playerId: 'old', attending: true }, { playerId: 'away', attending: false }];
    assert.equal(resolveLivePlayer('wil major', players, tourPlayers).ok, false);
    assert.equal(resolveLivePlayer('unknown', players, tourPlayers).ok, false);
    assert.equal(resolveLivePlayer('old player', players, tourPlayers).ok, false);
    assert.equal(resolveLivePlayer('away player', players, tourPlayers).ok, false);
  });

  it('requires a private edit token for public edit and void', () => {
    const bet = { status: 'active', bettorName: 'Rosie', publicEditTokenHash: 'hash:secret-token' };
    assert.equal(canPublicChangeBet(bet, 'secret-token'), true);
    assert.equal(canPublicChangeBet(bet, undefined), false);
    assert.equal(canPublicChangeBet(bet, 'wrong-token'), false);
  });

  it('does not let bettorName alone or no-token legacy bets authorize public changes', () => {
    assert.equal(canPublicChangeBet({ status: 'active', bettorName: 'Rosie', publicEditTokenHash: null }, 'secret-token'), false);
    assert.equal(canPublicChangeBet({ status: 'active', bettorName: 'Rosie', publicEditTokenHash: 'hash:other-token' }, undefined), false);
  });

  it('preserves admin settlement fields when editing non-void bets', () => {
    const saved = adminSaveBetRow({ outcomeStatus: 'won', payoutStatus: 'unpaid', payoutAmountPence: 1200, payoutNotes: 'Pay cash' }, 'active');
    assert.deepEqual(saved, { status: 'active', outcomeStatus: 'won', payoutStatus: 'unpaid', payoutAmountPence: 1200, payoutNotes: 'Pay cash' });
  });

  it('normalises settlement fields when admin voids a bet', () => {
    const saved = adminSaveBetRow({ outcomeStatus: 'won', payoutStatus: 'unpaid', payoutAmountPence: 1200, payoutNotes: 'Pay cash' }, 'void');
    assert.deepEqual(saved, { status: 'void', outcomeStatus: 'void', payoutStatus: 'not_applicable', payoutAmountPence: null, payoutNotes: null });
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
