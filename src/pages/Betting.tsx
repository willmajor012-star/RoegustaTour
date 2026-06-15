import { useEffect, useMemo, useState } from 'react';
import { BetMarketCard } from '../components/BetMarketCard';
import { fetchPublicBetMarkets, savePublicBet, type PublicBetMarketsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { buildBetPuntoBettorSummaries, buildBetPuntoMarketSummaries, formatPenceCurrency, formatStakeCurrency } from '../lib/betting';
import type { Bet } from '../lib/types';


function marketStatusLabel(status?: string) {
  if (status === 'open') return 'Open';
  if (status === 'closed') return 'Closed';
  if (status === 'settled') return 'Settled';
  if (status === 'void') return 'Void';
  return 'Unavailable';
}

const emptyBettingData: Omit<PublicBetMarketsResponse, 'source'> = { rounds: [], players: [], tourPlayers: [], betMarkets: [], betOptions: [], bets: [] };

export function Betting() {
  const [bettorName, setBettorName] = useState('');
  const { data, loading, error } = usePublicData(fetchPublicBetMarkets, { refreshMs: 10000 });
  const activeData = data ?? emptyBettingData;
  const [savedBets, setSavedBets] = useState<Bet[]>([]);
  const [submitMessages, setSubmitMessages] = useState<Record<string, string>>({});
  const [editingBetId, setEditingBetId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ optionId: '', stake: '', comment: '' });
  const bets = [...savedBets, ...activeData.bets.filter((bet) => !savedBets.some((savedBet) => savedBet.id === bet.id))];
  const activeBets = bets.filter((bet) => bet.status === 'active');
  const attendingPlayerIds = new Set(activeData.tourPlayers.filter((tourPlayer) => tourPlayer.attending).map((tourPlayer) => tourPlayer.playerId));
  const bettorOptions = activeData.players.filter((player) => attendingPlayerIds.has(player.id));
  const mandatoryBettorNames = bettorOptions.map((player) => player.displayName);
  const bettorSummaries = useMemo(() => buildBetPuntoBettorSummaries(activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames), [activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames]);
  const marketSummaries = useMemo(() => buildBetPuntoMarketSummaries(activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames), [activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames]);
  const stablefordMarketSummaries = marketSummaries.filter((summary) => summary.market.marketType === 'player_performance' && summary.market.title.toLowerCase().includes('stableford'));
  const settledDuePence = bettorSummaries.reduce((total, summary) => total + summary.settledPayoutPence, 0);
  const totalStakePence = bettorSummaries.reduce((total, summary) => total + summary.totalStakePence, 0);
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

  const upsertLocalBet = (bet: Bet) => setSavedBets((current) => [bet, ...current.filter((candidate) => candidate.id !== bet.id)]);

  const submit = async (marketId: string, optionId: string, _stakeAmount: number, stakeAmountPence: number, comment: string) => {
    const name = bettorName.trim();
    if (!name) return;
    saveName(name);
    setSubmitMessages((current) => ({ ...current, [marketId]: 'Saving your Bet Punto pick…' }));
    try {
      const response = await savePublicBet({ marketId, optionId, bettorName: name, stakeAmountPence, comment: comment || undefined });
      upsertLocalBet(response.bet);
      setSubmitMessages((current) => ({ ...current, [marketId]: 'Pick saved to the tour Bet Punto log.' }));
    } catch (saveError) {
      setSubmitMessages((current) => ({ ...current, [marketId]: saveError instanceof Error ? saveError.message : 'Pick could not be saved.' }));
      throw saveError;
    }
  };


  const editBet = async (bet: Bet) => {
    const market = activeData.betMarkets.find((candidate) => candidate.id === bet.marketId);
    if (!market || market.status !== 'open') return;
    const stakeAmountPence = Math.round(Number(editDraft.stake) * 100);
    if (!editDraft.optionId || !Number.isInteger(stakeAmountPence) || stakeAmountPence <= 0) return;
    const response = await savePublicBet({ action: 'edit', betId: bet.id, bettorName: bettorName.trim(), optionId: editDraft.optionId, stakeAmountPence, comment: editDraft.comment || undefined });
    upsertLocalBet(response.bet);
    setEditingBetId(null);
  };

  const voidBet = async (bet: Bet) => {
    const market = activeData.betMarkets.find((candidate) => candidate.id === bet.marketId);
    if (!market || market.status !== 'open') return;
    const response = await savePublicBet({ action: 'void', betId: bet.id, bettorName: bettorName.trim(), optionId: bet.optionId, stakeAmountPence: bet.stakeAmountPence ?? 1, comment: 'Cancelled by bettor' });
    upsertLocalBet(response.bet);
  };

  const beginEditBet = (bet: Bet) => {
    setEditingBetId(bet.id);
    setEditDraft({ optionId: bet.optionId, stake: String(((bet.stakeAmountPence ?? 0) / 100).toFixed(2)), comment: bet.comment ?? '' });
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

      <section className="card bet-summary-card">
        <div className="section-heading"><div><p className="eyebrow">Organiser summary</p><h3>Tour Bet Punto ledger</h3></div><strong>{formatPenceCurrency(totalStakePence)} staked</strong></div>
        <div className="stat-grid">
          <div className="stat-card"><span>Mandatory players</span><strong>{mandatoryBettorNames.length}</strong><small>Attending tour players expected to back each Stableford winner market.</small></div>
          <div className="stat-card"><span>Total picks</span><strong>{activeBets.length}</strong><small>Active Bet Punto entries across the tour.</small></div>
          <div className="stat-card"><span>Settled payouts</span><strong>{formatPenceCurrency(settledDuePence)}</strong><small>Calculated from settled markets and manual payout overrides.</small></div>
        </div>
        <div className="table-wrap">
          <table className="bet-summary-table">
            <thead><tr><th>Player</th><th>Picks</th><th>Staked</th><th>Settled payout</th><th>Net</th><th>W/L/P</th><th>Missing stableford</th></tr></thead>
            <tbody>{bettorSummaries.length === 0 ? <tr><td colSpan={7}>No player or bet summary yet.</td></tr> : bettorSummaries.map((summary) => <tr key={summary.bettorName}><td>{summary.bettorName}</td><td>{summary.totalBets}</td><td>{formatPenceCurrency(summary.totalStakePence)}</td><td>{formatPenceCurrency(summary.settledPayoutPence)}</td><td>{formatPenceCurrency(summary.netPence)}</td><td>{summary.won}/{summary.lost}/{summary.push}</td><td>{summary.missingStablefordPicks}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="card bet-summary-card">
        <div className="section-heading"><div><p className="eyebrow">Mandatory daily bet</p><h3>Stableford pick coverage</h3></div><strong>{stablefordMarketSummaries.length} market{stablefordMarketSummaries.length === 1 ? '' : 's'}</strong></div>
        <div className="table-wrap">
          <table className="bet-summary-table">
            <thead><tr><th>Market</th><th>Status</th><th>Picks</th><th>Pot</th><th>Missing players</th></tr></thead>
            <tbody>{stablefordMarketSummaries.length === 0 ? <tr><td colSpan={5}>No Stableford winner markets have been created yet.</td></tr> : stablefordMarketSummaries.map((summary) => <tr key={summary.market.id}><td>{summary.market.title}</td><td>{marketStatusLabel(summary.market.status)}</td><td>{summary.totalBets}/{mandatoryBettorNames.length}</td><td>{formatPenceCurrency(summary.totalStakePence)}</td><td>{summary.missingBettorNames.length === 0 ? 'Complete' : summary.missingBettorNames.join(', ')}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="card bet-tracker-card">
        <div className="section-heading"><div><p className="eyebrow">Your tracker</p><h3>{bettorName.trim() ? bettorName.trim() : 'Choose your name'}</h3></div><strong>{myBets.length} pick{myBets.length === 1 ? '' : 's'}</strong></div>
        {!bettorName.trim() ? <p>Select your name to see your Bet Punto picks across live, closed and settled markets.</p> : myBets.length === 0 ? <p>No picks logged for this name yet.</p> : <div className="bet-tracker-list">{myBets.map((bet) => {
          const market = activeData.betMarkets.find((candidate) => candidate.id === bet.marketId);
          const option = activeData.betOptions.find((candidate) => candidate.id === bet.optionId);
          const round = market?.roundId ? activeData.rounds.find((candidate) => candidate.id === market.roundId) : undefined;
          const editable = market?.status === 'open';
          return <article key={bet.id}><strong>{market?.title ?? 'Bet Punto market'}</strong><span>{option?.label ?? 'Option'} · {formatStakeCurrency(bet)} · {marketStatusLabel(market?.status)}{round ? ` · Round ${round.roundNumber}` : ''}</span>{bet.comment ? <small>{bet.comment}</small> : null}{editable && editingBetId !== bet.id ? <div className="chip-list"><button className="pill" type="button" onClick={() => beginEditBet(bet)}>Edit pick</button><button className="pill" type="button" onClick={() => void voidBet(bet)}>Cancel pick</button></div> : null}{editable && editingBetId === bet.id ? <div className="bet-form"><select value={editDraft.optionId} onChange={(event) => setEditDraft({ ...editDraft, optionId: event.target.value })}>{activeData.betOptions.filter((candidate) => candidate.marketId === bet.marketId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select><input inputMode="decimal" value={editDraft.stake} onChange={(event) => setEditDraft({ ...editDraft, stake: event.target.value })} /><input value={editDraft.comment} onChange={(event) => setEditDraft({ ...editDraft, comment: event.target.value })} /><button type="button" onClick={() => void editBet(bet)}>Save edit</button><button type="button" onClick={() => setEditingBetId(null)}>Cancel edit</button></div> : null}</article>;
        })}</div>}
      </section>
      {!loading && !error && activeData.betMarkets.length === 0 && <p className="card">Bet Punto markets will appear once they are added.</p>}
      {(['open', 'closed', 'settled', 'void'] as const).map((status) => {
        const markets = activeData.betMarkets.filter((market) => market.status === status);
        if (markets.length === 0) return null;
        return <section className="market-section" key={status}>
          <div className="section-heading"><div><p className="eyebrow">Bet Punto</p><h2>{marketStatusLabel(status)} markets</h2></div></div>
          {markets.map((market) => (
            <BetMarketCard key={market.id} market={market} round={activeData.rounds.find((round) => round.id === market.roundId)} options={activeData.betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={bettorName} onSubmit={submit} submitMessage={submitMessages[market.id]} />
          ))}
        </section>;
      })}
    </div>
  );
}
