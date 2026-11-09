import { formatPenceCurrency, getBetStakePence } from '../lib/betting';
import type { PublicBetMarketsResponse } from '../lib/publicApi';

export function TourPayouts({ data }: { data: Omit<PublicBetMarketsResponse, 'source'> }) {
  const rounds = data.tour?.prizeFund?.rounds ?? [];
  const rows = data.players.map(p => ({ id: p.id, name: p.displayName, prizes: rounds.map(() => 0), stake: 0, returns: 0 }));
  const byId = new Map(rows.map(row => [row.id, row]));
  const byName = new Map(rows.map(row => [row.name.trim().toLowerCase(), row]));
  const attending = new Set(data.tourPlayers.filter(p => p.attending).map(p => p.playerId));
  const settled = new Set(data.betMarkets.filter(m => m.status === 'settled').map(m => m.id));
  let unmatched = 0;
  for (const prize of data.roundPrizeResults ?? []) {
    const match = /^(?:(.+?) · )?(\d+)(?:st|nd|rd|th) · (.+)$/.exec(prize.title);
    if (!match) continue;
    const roundNumber = data.rounds.find(r => r.id === prize.roundId)?.roundNumber;
    const index = rounds.findIndex(r => match[1] ? r.title === match[1] || (r.poolKey === 'monday' && match[1] === 'Monday scramble') : r.roundNumber === roundNumber);
    const fund = rounds[index];
    const amount = fund?.payoutsPence[Number(match[2]) - 1];
    if (!amount) continue;
    const winners = prize.winnerPlayerId ? [byId.get(prize.winnerPlayerId)] : match[3].split(' & ').map(name => byName.get(name.trim().toLowerCase()));
    if (winners.length !== (fund.paidPer === 'pair' ? 2 : 1) || winners.some(w => !w) || new Set(winners).size !== winners.length) { unmatched++; continue; }
    winners.forEach((winner, i) => { winner!.prizes[index] += Math.floor(amount / winners.length) + Number(i < amount % winners.length); });
  }
  for (const bet of data.bets) {
    if (!settled.has(bet.marketId) || bet.status !== 'active' || bet.outcomeStatus === 'void' || bet.outcomeStatus === 'pending') continue;
    const row = (bet.bettorPlayerId ? byId.get(bet.bettorPlayerId) : undefined) ?? byName.get(bet.bettorName.trim().toLowerCase());
    if (!row) { unmatched++; continue; }
    const stake = getBetStakePence(bet) ?? 0;
    row.stake += stake;
    row.returns += bet.payoutAmountPence ?? (bet.outcomeStatus === 'push' ? stake : 0);
  }
  const players = rows.map(r => ({ ...r, prizeTotal: r.prizes.reduce((a, b) => a + b, 0), netBet: r.returns - r.stake })).filter(r => attending.has(r.id) || r.prizeTotal || r.stake || r.returns);
  if (!players.some(r => r.prizeTotal || r.stake || r.returns) && !unmatched) return null;
  const money = formatPenceCurrency;
  const sum = (value: (row: typeof players[number]) => number) => money(players.reduce((n, row) => n + value(row), 0));
  const combined = (row: typeof players[number]) => row.prizeTotal + row.netBet;
  const ordered = (value: typeof combined) => [...players].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name));
  return <details className="card tour-payouts">
    <summary><strong>Tour prizes and net payouts</strong></summary>
    <p>Pair prizes are split equally. Net betting is returns less stakes on settled markets. Total net is prizes plus net betting.</p>
    {unmatched > 0 && <p>{unmatched} prize or betting entries could not be matched to a player.</p>}
    <h3>Prize leaderboard</h3>
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Prize leaderboard"><table>
      <thead><tr><th>Player</th>{rounds.map(r => <th key={r.poolKey}>{r.title}</th>)}<th>Total prizes</th></tr></thead>
      <tbody>{ordered(r => r.prizeTotal).map(r => <tr key={r.id}><th scope="row">{r.name}</th>{r.prizes.map((n, i) => <td key={i}>{n ? money(n) : '—'}</td>)}<td><strong>{money(r.prizeTotal)}</strong></td></tr>)}</tbody>
      <tfoot><tr><th>Total</th>{rounds.map((r, i) => <td key={r.poolKey}>{sum(p => p.prizes[i])}</td>)}<td>{sum(p => p.prizeTotal)}</td></tr></tfoot>
    </table></div>
    <h3>Prizes and net betting</h3>
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Prizes and net betting"><table>
      <thead><tr><th>Player</th><th>Prizes</th><th>Stakes</th><th>Betting returns</th><th>Net betting</th><th>Total net</th></tr></thead>
      <tbody>{ordered(combined).map(r => <tr key={r.id}><th scope="row">{r.name}</th><td>{money(r.prizeTotal)}</td><td>{money(r.stake)}</td><td>{money(r.returns)}</td><td>{money(r.netBet)}</td><td><strong>{money(combined(r))}</strong></td></tr>)}</tbody>
      <tfoot><tr><th>Total</th><td>{sum(r => r.prizeTotal)}</td><td>{sum(r => r.stake)}</td><td>{sum(r => r.returns)}</td><td>{sum(r => r.netBet)}</td><td>{sum(combined)}</td></tr></tfoot>
    </table></div>
  </details>;
}
