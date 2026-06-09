import { useEffect, useState } from 'react';
import { BetMarketCard } from '../components/BetMarketCard';
import { fetchPublicBetMarkets, type PublicBetMarketsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import type { Bet } from '../lib/types';

const emptyBettingData: Omit<PublicBetMarketsResponse, 'source'> = { betMarkets: [], betOptions: [], bets: [] };

export function Betting() {
  const [bettorName, setBettorName] = useState('');
  const { data, loading, error } = usePublicData(fetchPublicBetMarkets);
  const activeData = data ?? emptyBettingData;
  const [localBets, setLocalBets] = useState<Bet[]>([]);
  const bets = [...localBets, ...activeData.bets];

  useEffect(() => setBettorName(localStorage.getItem('rt-bettor-name') ?? ''), []);

  const saveName = (name: string) => {
    setBettorName(name);
    localStorage.setItem('rt-bettor-name', name);
  };

  const submit = (marketId: string, optionId: string, stakeAmount: number, stakeAmountPence: number, comment: string) => {
    const name = bettorName.trim();
    if (!name) return;
    saveName(name);
    setLocalBets((current) => [
      { id: `local-${Date.now()}`, marketId, optionId, bettorName: name, stakeText: `£${stakeAmount}`, stakeAmount, stakeAmountPence, comment, createdAt: new Date().toISOString(), status: 'active' },
      ...current,
    ]);
  };

  return (
    <div className="page-stack">
      <section className="page-title">
        <p className="eyebrow">Visible voting and stake log</p>
        <h2>Bet Punto</h2>
        <p>No wallet, no payment handling and no money transfer. This is only a Bet Punto voting and stake log.</p>
      </section>
      {loading && <p className="card">Loading Bet Punto markets…</p>}
      {error && <p className="card form-error">{error}</p>}
      <label className="name-picker">
        Your name
        <input value={bettorName} placeholder="Select or type your name" onChange={(event) => saveName(event.target.value)} />
      </label>
      {!loading && !error && activeData.betMarkets.length === 0 && <p className="card">Bet Punto markets will appear once they are added.</p>}
      {(['open', 'closed', 'settled'] as const).map((status) => {
        const markets = activeData.betMarkets.filter((market) => market.status === status);
        if (markets.length === 0) return null;
        return <section key={status}>
          <h2>{status[0].toUpperCase() + status.slice(1)} markets</h2>
          {markets.map((market) => (
            <BetMarketCard key={market.id} market={market} options={activeData.betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={bettorName} onSubmit={submit} />
          ))}
        </section>;
      })}
    </div>
  );
}
