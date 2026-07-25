import { useEffect, useMemo, useState } from 'react';
import { BetMarketCard } from '../components/BetMarketCard';
import { PageHeader } from '../components/PageHeader';
import { fetchPublicBetMarkets, savePublicBet, type PublicBetMarketsResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { betMarketUiStatusLabel, buildBetPuntoBettorSummaries, buildBetPuntoMarketSummaries, formatPenceCurrency, formatStakeCurrency, isMarketPubliclyEditable } from '../lib/betting';
import type { Bet } from '../lib/types';

function normalizeBettorInput(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function marketStatusLabel(status?: string) {
  if (status === 'draft') return 'Draft';
  if (status === 'open') return 'Open';
  if (status === 'closed') return 'Closed / awaiting result';
  if (status === 'settled') return 'Settled';
  if (status === 'void') return 'Void';
  return 'Unavailable';
}

function netPositionLabel(netPence: number) {
  if (netPence > 0) return `Up ${formatPenceCurrency(netPence)}`;
  if (netPence < 0) return `Down ${formatPenceCurrency(Math.abs(netPence))}`;
  return 'Even';
}

const emptyBettingData: Omit<PublicBetMarketsResponse, 'source'> = { tour: undefined, rounds: [], players: [], tourPlayers: [], betMarkets: [], betOptions: [], bets: [] };
const betEditTokenStorageKey = 'rt-bet-edit-tokens';

function readBetEditTokens() {
  try {
    return JSON.parse(localStorage.getItem(betEditTokenStorageKey) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveBetEditToken(betId: string, editToken?: string) {
  if (!editToken) return;
  const tokens = readBetEditTokens();
  tokens[betId] = editToken;
  localStorage.setItem(betEditTokenStorageKey, JSON.stringify(tokens));
}

function betEditToken(betId: string) {
  return readBetEditTokens()[betId];
}


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
  const bettorOptions = activeData.players.filter((player) => player.active && attendingPlayerIds.has(player.id));
  const mandatoryBettorNames = bettorOptions.map((player) => player.displayName);
  const selectedBettorPlayer = useMemo(() => {
    const normalizedInput = normalizeBettorInput(bettorName);
    if (!normalizedInput) return undefined;
    return bettorOptions.find((player) => normalizeBettorInput(player.displayName) === normalizedInput || (player.nickname && normalizeBettorInput(player.nickname) === normalizedInput));
  }, [bettorName, bettorOptions]);
  const bettorSummaries = useMemo(() => buildBetPuntoBettorSummaries(activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames), [activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames]);
  const marketSummaries = useMemo(() => buildBetPuntoMarketSummaries(activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames), [activeData.betMarkets, activeData.betOptions, bets, mandatoryBettorNames]);
  const requiredMarketSummaries = marketSummaries.filter((summary) => summary.market.required ?? (summary.market.marketType === 'player_performance' && summary.market.title.toLowerCase().includes('stableford')));
  const leaderboard = useMemo(() => [...bettorSummaries].sort((a, b) => b.netPence - a.netPence || b.settledPayoutPence - a.settledPayoutPence || a.bettorName.localeCompare(b.bettorName)), [bettorSummaries]);
  const settledDuePence = bettorSummaries.reduce((total, summary) => total + summary.settledPayoutPence, 0);
  const totalStakePence = bettorSummaries.reduce((total, summary) => total + summary.totalStakePence, 0);
  const pendingStakePence = bettorSummaries.reduce((total, summary) => total + summary.pendingStakePence, 0);
  const myBets = useMemo(() => {
    const normalizedInput = normalizeBettorInput(bettorName);
    const normalizedDisplayName = normalizeBettorInput(selectedBettorPlayer?.displayName ?? bettorName);
    if (!normalizedInput) return [];
    return activeBets.filter((bet) => {
      if (selectedBettorPlayer && bet.bettorPlayerId) return bet.bettorPlayerId === selectedBettorPlayer.id;
      if (bet.bettorPlayerId) return false;
      const normalizedBetName = normalizeBettorInput(bet.bettorName);
      return normalizedBetName === normalizedDisplayName || normalizedBetName === normalizedInput;
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [activeBets, bettorName, selectedBettorPlayer]);
  const mainMarkets = activeData.betMarkets.filter((market) => {
    const round = activeData.rounds.find((candidate) => candidate.id === market.roundId);
    if (market.marketType === 'team_result') return round?.format === 'scramble';
    if (market.marketType === 'player_performance') return round?.format !== 'scramble';
    return false;
  });
  const mainMarketIds = new Set(mainMarkets.map((market) => market.id));
  const openMarkets = mainMarkets.filter((market) => isMarketPubliclyEditable(market));
  const awaitingMarkets = mainMarkets.filter((market) => market.status === 'closed' || market.status === 'open' && !isMarketPubliclyEditable(market));
  const settledMarkets = mainMarkets.filter((market) => market.status === 'settled');
  const otherMarkets = activeData.betMarkets.filter((market) => !mainMarketIds.has(market.id) && market.status !== 'void');

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
      saveBetEditToken(response.bet.id, response.editToken);
      saveName(response.bet.bettorName);
      upsertLocalBet(response.bet);
      setSubmitMessages((current) => ({ ...current, [marketId]: 'Pick saved to the tour Bet Punto log.' }));
    } catch (saveError) {
      setSubmitMessages((current) => ({ ...current, [marketId]: saveError instanceof Error ? saveError.message : 'Pick could not be saved.' }));
      throw saveError;
    }
  };


  const editBet = async (bet: Bet) => {
    const market = activeData.betMarkets.find((candidate) => candidate.id === bet.marketId);
    if (!market || !isMarketPubliclyEditable(market)) return;
    const stakeAmountPence = Math.round(Number(editDraft.stake) * 100);
    if (!editDraft.optionId || !Number.isInteger(stakeAmountPence) || stakeAmountPence <= 0) return;
    const editToken = betEditToken(bet.id);
    if (!editToken) return;
    const response = await savePublicBet({ action: 'edit', betId: bet.id, bettorName: bettorName.trim(), optionId: editDraft.optionId, stakeAmountPence, comment: editDraft.comment || undefined, editToken });
    upsertLocalBet(response.bet);
    setEditingBetId(null);
  };

  const voidBet = async (bet: Bet) => {
    const market = activeData.betMarkets.find((candidate) => candidate.id === bet.marketId);
    if (!market || !isMarketPubliclyEditable(market)) return;
    const editToken = betEditToken(bet.id);
    if (!editToken) return;
    const response = await savePublicBet({ action: 'void', betId: bet.id, bettorName: bettorName.trim(), optionId: bet.optionId, stakeAmountPence: bet.stakeAmountPence ?? 1, comment: 'Cancelled by bettor', editToken });
    upsertLocalBet(response.bet);
  };

  const beginEditBet = (bet: Bet) => {
    setEditingBetId(bet.id);
    setEditDraft({ optionId: bet.optionId, stake: String(((bet.stakeAmountPence ?? 0) / 100).toFixed(2)), comment: bet.comment ?? '' });
  };

  return (
    <div className="page-stack betting-page">
      <PageHeader className="bet-punto-header" eyebrow="Friendly tour betting" title="Bet Punto" />
      {loading && <p className="card">Loading Bet Punto markets…</p>}
      {error && <p className="card form-error">{error}</p>}
      <section className="card bettor-identity-card">
        <div><p className="eyebrow">Step one</p><h3>Who are you?</h3><p>Your selection is remembered on this device.</p></div>
        <label className="name-picker">
          Your name
          <select value={selectedBettorPlayer?.displayName ?? ''} onChange={(event) => saveName(event.target.value)}>
            <option value="">Choose your name</option>
            {bettorOptions.map((player) => <option key={player.id} value={player.displayName}>{player.displayName}{player.nickname ? ` · ${player.nickname}` : ''}</option>)}
          </select>
        </label>
        <small>£10 minimum per playing day. Stakes are in £5 increments and additional bets are allowed before close.</small>
      </section>

      {!loading && !error && <>
        <section className="card bet-tour-ledger">
          <div className="section-heading">
            <div><p className="eyebrow">Live tour tally</p><h2>Bet Punto leaderboard</h2></div>
            <strong>{leaderboard.length} player{leaderboard.length === 1 ? '' : 's'}</strong>
          </div>
          <div className="bet-ledger-totals">
            <div><span>Total staked</span><strong>{formatPenceCurrency(totalStakePence)}</strong></div>
            <div><span>Payouts</span><strong>{formatPenceCurrency(settledDuePence)}</strong></div>
            <div><span>Still live</span><strong>{formatPenceCurrency(pendingStakePence)}</strong></div>
          </div>
          <div className="bet-ledger-list">
            {leaderboard.length === 0 ? <p>No bets have been staked yet.</p> : leaderboard.map((summary, index) => <article className="bet-ledger-row" key={summary.bettorName}>
              <span className="bet-ledger-rank">{index + 1}</span>
              <div className="bet-ledger-player">
                <strong>{summary.bettorName}</strong>
                <small>{summary.totalBets} bet{summary.totalBets === 1 ? '' : 's'}{summary.automaticDefaultStakePence > 0 ? ` · ${formatPenceCurrency(summary.automaticDefaultStakePence)} automatic` : ''}</small>
              </div>
              <dl>
                <div><dt>Staked</dt><dd>{formatPenceCurrency(summary.totalStakePence)}</dd></div>
                <div><dt>Payout</dt><dd>{formatPenceCurrency(summary.settledPayoutPence)}</dd></div>
                <div className={`bet-ledger-net ${summary.netPence > 0 ? 'positive' : summary.netPence < 0 ? 'negative' : 'neutral'}`}><dt>Net</dt><dd>{netPositionLabel(summary.netPence)}</dd></div>
              </dl>
            </article>)}
          </div>
          <small>Running tour position includes all stakes and settled payouts. Any payment is handled offline after the tour.</small>
        </section>

        <section className="market-section active-market-section">
          <div className="section-heading"><div><p className="eyebrow">Open now</p><h2>Place a bet</h2></div><strong>{openMarkets.length} market{openMarkets.length === 1 ? '' : 's'}</strong></div>
          {openMarkets.length === 0 ? <p className="card">There is no open market right now. The next market will appear when Admin opens it.</p> : openMarkets.map((market) => {
            const round = activeData.rounds.find((candidate) => candidate.id === market.roundId);
            return <BetMarketCard key={market.id} market={market} round={round} timeZone={activeData.tour?.timezone} options={activeData.betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={selectedBettorPlayer?.displayName ?? ''} onSubmit={submit} submitMessage={submitMessages[market.id]} />;
          })}
        </section>

        <section className="card bet-tracker-card">
          <div className="section-heading"><div><p className="eyebrow">Your bets</p><h3>{selectedBettorPlayer?.displayName ?? 'Choose your name'}</h3></div><strong>{myBets.length}</strong></div>
          {!selectedBettorPlayer ? <p>Choose your name to see and manage your bets.</p> : myBets.length === 0 ? <p>You have not placed a bet yet.</p> : <div className="bet-tracker-list">{myBets.map((bet) => {
          const market = activeData.betMarkets.find((candidate) => candidate.id === bet.marketId);
          const option = activeData.betOptions.find((candidate) => candidate.id === bet.optionId);
          const round = market?.roundId ? activeData.rounds.find((candidate) => candidate.id === market.roundId) : undefined;
          const editable = Boolean(market && isMarketPubliclyEditable(market) && betEditToken(bet.id));
          return <article key={bet.id}><strong>{market?.title ?? 'Bet Punto market'}</strong><span>{option?.label ?? 'Option'} · {formatStakeCurrency(bet)} · {marketStatusLabel(market?.status)}{round ? ` · Round ${round.roundNumber}` : ''}</span>{bet.entrySource === 'automatic_default' ? <small>Automatic first-tee default</small> : bet.comment ? <small>{bet.comment}</small> : null}{editable && editingBetId !== bet.id ? <div className="chip-list"><button className="pill" type="button" onClick={() => beginEditBet(bet)}>Edit pick</button><button className="pill" type="button" onClick={() => void voidBet(bet)}>Cancel pick</button></div> : null}{editable && editingBetId === bet.id ? <div className="bet-form"><select value={editDraft.optionId} onChange={(event) => setEditDraft({ ...editDraft, optionId: event.target.value })}>{activeData.betOptions.filter((candidate) => candidate.marketId === bet.marketId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select><input inputMode="decimal" value={editDraft.stake} onChange={(event) => setEditDraft({ ...editDraft, stake: event.target.value })} /><input value={editDraft.comment} onChange={(event) => setEditDraft({ ...editDraft, comment: event.target.value })} /><button type="button" onClick={() => void editBet(bet)}>Save edit</button><button type="button" onClick={() => setEditingBetId(null)}>Cancel edit</button></div> : null}</article>;
          })}</div>}
        </section>

        {awaitingMarkets.length > 0 && <section className="market-section awaiting-market-section">
          <div className="section-heading"><div><p className="eyebrow">Closed</p><h2>Awaiting results</h2></div></div>
          {awaitingMarkets.map((market) => {
            const round = activeData.rounds.find((candidate) => candidate.id === market.roundId);
            return <BetMarketCard key={market.id} market={market} round={round} timeZone={activeData.tour?.timezone} options={activeData.betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={selectedBettorPlayer?.displayName ?? ''} />;
          })}
        </section>}

        {settledMarkets.length > 0 && <details className="card betting-history-details">
          <summary><span><small>Results</small><strong>Settled markets</strong></span><b>{settledMarkets.length}</b></summary>
          <div className="settled-market-list">{settledMarkets.map((market) => {
            const round = activeData.rounds.find((candidate) => candidate.id === market.roundId);
            return <BetMarketCard key={market.id} market={market} round={round} timeZone={activeData.tour?.timezone} options={activeData.betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={selectedBettorPlayer?.displayName ?? ''} />;
          })}</div>
        </details>}

        {otherMarkets.length > 0 && <details className="card betting-history-details">
          <summary><span><small>Legacy</small><strong>Other markets</strong></span><b>{otherMarkets.length}</b></summary>
          <div>{otherMarkets.map((market) => {
            const round = activeData.rounds.find((candidate) => candidate.id === market.roundId);
            return <BetMarketCard key={market.id} market={market} round={round} timeZone={activeData.tour?.timezone} options={activeData.betOptions.filter((option) => option.marketId === market.id)} bets={bets} bettorName={selectedBettorPlayer?.displayName ?? ''} onSubmit={submit} submitMessage={submitMessages[market.id]} />;
          })}</div>
        </details>}

        <details className="card betting-admin-details">
          <summary><span><small>Market detail</small><strong>Daily coverage</strong></span><b>{requiredMarketSummaries.length}</b></summary>
          <div className="table-wrap"><table className="bet-summary-table"><thead><tr><th>Required market</th><th>Status</th><th>Picks</th><th>Pot</th><th>Missing</th></tr></thead><tbody>{requiredMarketSummaries.length === 0 ? <tr><td colSpan={5}>No required markets yet.</td></tr> : requiredMarketSummaries.map((summary) => <tr key={summary.market.id}><td>{summary.market.title}</td><td>{betMarketUiStatusLabel(summary.market)}</td><td>{summary.totalBets}/{mandatoryBettorNames.length}</td><td>{formatPenceCurrency(summary.totalStakePence)}</td><td>{summary.missingBettorNames.length === 0 ? 'Complete' : summary.missingBettorNames.join(', ')}</td></tr>)}</tbody></table></div>
          <small>At the fixed first tee time, any shortfall to £10 is added automatically on the player themselves or their own scramble team.</small>
        </details>
      </>}
    </div>
  );
}
