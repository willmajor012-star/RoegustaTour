import { useEffect, useMemo, useState } from 'react';
import { BetMarketCard } from '../components/BetMarketCard';
import { fetchPublicBetMarkets, savePublicBet, type PublicBetMarketsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { formatStakeCurrency } from '../lib/betting';
import type { Bet } from '../lib/types';

const emptyBettingData: Omit<PublicBetMarketsResponse, 'source'> = { rounds: [], players: [], tourPlayers: [], betMarkets: [], betOptions: [], bets: [] };

export function Betting() {
  const [bettorName, setBettorName] = useState('');
  const { data, loading, error } = usePublicData(fetchPublicBetMarkets, { refreshMs: 10000 });
  const activeData = data ?? emptyBettingData;
  const [savedBets, setSavedBets] = useState<Bet[]>([]);
  const [submitMessages, setSubmitMessages] = useState<Record<string, string>>({});
  const bets = [...savedBets, ...activeData.bets.filter((bet) => !savedBets.some((savedBet) => savedBet.id === bet.id))];
  const activeBets = bets.filter((bet) => bet.status === 'active');
  const attendingPlayerIds = new Set(activeData.tourPlayers.filter((tourPlayer) => tourPlayer.attending).map((tourPlayer) => tourPlayer.playerId));
  const bettorOptions = activeData.players.filter((player) => attendingPlayerIds.has(player.id));
  const myBets = useMemo(() => {
    const normalizedName = bettorName.trim().toLowerCase();
    if (!normalizedName) return [];
    return activeBets.filter((bet) => bet.bettorName.trim().toLowerCase() === normalizedName).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [activeBets, bettorName]);

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
        <input list="bettor-name-options" value={bettorName} placeholder="Select or type your name" onChange={(event) => saveName(event.target.value)} />
        <datalist id="bettor-name-options">
          {bettorOptions.map((player) => <option key={player.id} value={player.displayName} />)}
        </datalist>
      </label>
      <section className="card bet-tracker-card">
        <div className="section-heading"><div><p className="eyebrow">Your tracker</p><h3>{bettorName.trim() ? bettorName.trim() : 'Choose your name'}</h3></div><strong>{myBets.length} pick{myBets.length === 1 ? '' : 's'}</strong></div>
        {!bettorName.trim() ? <p>Select your name to see your Bet Punto picks across live, closed and settled markets.</p> : myBets.length === 0 ? <p>No picks logged for this name yet.</p> : <div className="bet-tracker-list">{myBets.map((bet) => {
          const market = activeData.betMarkets.find((candidate) => candidate.id === bet.marketId);
          const option = activeData.betOptions.find((candidate) => candidate.id === bet.optionId);
          const round = market?.roundId ? activeData.rounds.find((candidate) => candidate.id === market.roundId) : undefined;
          return <article key={bet.id}><strong>{market?.title ?? 'Bet Punto market'}</strong><span>{option?.label ?? 'Option'} · {formatStakeCurrency(bet)} · {market?.status ?? 'status TBC'}{round ? ` · Round ${round.roundNumber}` : ''}</span>{bet.comment ? <small>{bet.comment}</small> : null}</article>;
        })}</div>}
      </section>
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
