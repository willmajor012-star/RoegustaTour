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
