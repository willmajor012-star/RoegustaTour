import { useEffect, useState } from 'react';
import { BetMarketCard } from '../components/BetMarketCard';
import { betMarkets, betOptions, bets as seedBets } from '../data/mockData';
import type { Bet } from '../lib/types';

export function Betting() {
  const [bettorName, setBettorName] = useState('');
  const [bets, setBets] = useState<Bet[]>(seedBets);

  useEffect(() => setBettorName(localStorage.getItem('rt-bettor-name') ?? ''), []);

  const saveName = (name: string) => {
    setBettorName(name);
    localStorage.setItem('rt-bettor-name', name);
  };

  const submit = (marketId: string, optionId: string, stakeAmount: number, stakeAmountPence: number, comment: string) => {
    const name = bettorName.trim();
    if (!name) return;
    saveName(name);
    setBets((current) => [
      { id: `local-${Date.now()}`, marketId, optionId, bettorName: name, stakeText: `£${stakeAmount}`, stakeAmount, stakeAmountPence, comment, createdAt: new Date().toISOString(), status: 'active' },
      ...current,
    ]);
  };

  return (
    <div className="page-stack">
      <section className="page-title">
        <p className="eyebrow">Visible voting and stake log</p>
        <h2>Betting</h2>
        <p>No wallet, no payment handling and no money transfer. This is only a social tour betting/voting log.</p>
      </section>
      <label className="name-picker">
        Your name
        <input value={bettorName} placeholder="Select or type your name" onChange={(event) => saveName(event.target.value)} />
      </label>
      {(['open', 'closed', 'settled'] as const).map((status) => (
        <section key={status}>
          <h2>{status[0].toUpperCase() + status.slice(1)} markets</h2>
          {betMarkets.filter((market) => market.status === status).map((market) => (
            <BetMarketCard key={market.id} market={market} options={betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={bettorName} onSubmit={submit} />
          ))}
        </section>
      ))}
    </div>
  );
}
