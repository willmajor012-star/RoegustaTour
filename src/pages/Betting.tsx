import { useEffect, useState } from 'react';
import { BetMarketCard } from '../components/BetMarketCard';
import { fetchPublicBetMarkets, savePublicBet, type PublicBetMarketsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import type { Bet } from '../lib/types';

const emptyBettingData: Omit<PublicBetMarketsResponse, 'source'> = { rounds: [], betMarkets: [], betOptions: [], bets: [] };

export function Betting() {
  const [bettorName, setBettorName] = useState('');
  const { data, loading, error } = usePublicData(fetchPublicBetMarkets);
  const activeData = data ?? emptyBettingData;
  const [savedBets, setSavedBets] = useState<Bet[]>([]);
  const [submitMessages, setSubmitMessages] = useState<Record<string, string>>({});
  const bets = [...savedBets, ...activeData.bets.filter((bet) => !savedBets.some((savedBet) => savedBet.id === bet.id))];

  useEffect(() => setBettorName(localStorage.getItem('rt-bettor-name') ?? ''), []);
  useEffect(() => setSavedBets([]), [data]);

  const saveName = (name: string) => {
    setBettorName(name);
    localStorage.setItem('rt-bettor-name', name);
  };

  const submit = async (marketId: string, optionId: string, _stakeAmount: number, stakeAmountPence: number, comment: string) => {
    const name = bettorName.trim();
    if (!name) return;
    saveName(name);
    setSubmitMessages((current) => ({ ...current, [marketId]: 'Saving your Bet Punto pick…' }));
    try {
      const response = await savePublicBet({ marketId, optionId, bettorName: name, stakeAmountPence, comment: comment || undefined });
      setSavedBets((current) => [response.bet, ...current.filter((bet) => bet.id !== response.bet.id)]);
      setSubmitMessages((current) => ({ ...current, [marketId]: 'Pick saved to the tour Bet Punto log.' }));
    } catch (saveError) {
      setSubmitMessages((current) => ({ ...current, [marketId]: saveError instanceof Error ? saveError.message : 'Pick could not be saved.' }));
      throw saveError;
    }
  };

  return (
    <div className="page-stack betting-page">
      <section className="page-title premium-title bet-punto-hero card">
        <p className="eyebrow">Visible voting and stake log</p>
        <h2>Bet Punto</h2>
        <p>No wallet, no payment handling and no money transfer. This is only a private tour stake log and indicative payout tracker.</p>
      </section>
      {loading && <p className="card">Loading Bet Punto markets…</p>}
      {error && <p className="card form-error">{error}</p>}
      <label className="name-picker card">
        Your name
        <input value={bettorName} placeholder="Select or type your name" onChange={(event) => saveName(event.target.value)} />
      </label>
      {!loading && !error && activeData.betMarkets.length === 0 && <p className="card">Bet Punto markets will appear once they are added.</p>}
      {(['open', 'closed', 'settled'] as const).map((status) => {
        const markets = activeData.betMarkets.filter((market) => market.status === status);
        if (markets.length === 0) return null;
        return <section className="market-section" key={status}>
          <div className="section-heading"><div><p className="eyebrow">Bet Punto</p><h2>{status[0].toUpperCase() + status.slice(1)} markets</h2></div></div>
          {markets.map((market) => (
            <BetMarketCard key={market.id} market={market} round={activeData.rounds.find((round) => round.id === market.roundId)} options={activeData.betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={bettorName} onSubmit={submit} submitMessage={submitMessages[market.id]} />
          ))}
        </section>;
      })}
    </div>
  );
}
