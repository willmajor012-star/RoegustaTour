import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { betMarketUiStatusLabel, betPuntoMarketKind, buildMarketOptionStakeRows, calculateIndicativePayouts, calculateMarketPotPence, formatPenceCurrency, formatStakeCurrency, isMarketPubliclyEditable } from '../lib/betting';
import type { Bet, BetMarket, BetOption, Round } from '../lib/types';
import { formatShortDate } from '../lib/formatting';
import { formatTeeTimeDisplay } from '../lib/display';

type Props = {
  market: BetMarket;
  round?: Round;
  options: BetOption[];
  bets: Bet[];
  bettorName: string;
  onSubmit?: (marketId: string, optionId: string, stakeAmount: number, stakeAmountPence: number, comment: string) => Promise<void> | void;
  submitMessage?: string;
};

const stakeChoices = [500, 1000, 1500, 2000];

function marketTypeLabel(market: BetMarket) {
  const kind = betPuntoMarketKind(market);
  if (kind === 'player_winner') return 'Highest Stableford';
  if (kind === 'team_winner') return 'Lowest scramble score';
  return 'Other market';
}

function closeLabel(closesAt?: string | null) {
  if (!closesAt) return 'Close time TBC';
  const date = new Date(closesAt);
  if (!Number.isFinite(date.getTime())) return 'Close time TBC';
  return `Closes ${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function BetMarketCard({ market, round, options, bets, bettorName, onSubmit, submitMessage }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? '');
  const [selectedStakePence, setSelectedStakePence] = useState(1000);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeBets = bets.filter((bet) => bet.marketId === market.id && bet.status === 'active');
  const isOpen = isMarketPubliclyEditable(market);
  const potPence = calculateMarketPotPence(market.id, bets);
  const payoutSummary = useMemo(() => calculateIndicativePayouts(market, options, bets), [market, options, bets]);
  const winningOption = options.find((option) => option.id === market.resultOptionId);
  const winningBets = winningOption ? activeBets.filter((bet) => bet.optionId === winningOption.id) : [];
  const optionStakeRows = buildMarketOptionStakeRows(options, activeBets);
  const winningPayoutPence = winningBets.reduce((total, bet) => total + (payoutSummary.payouts.get(bet.id) ?? 0), 0);

  useEffect(() => {
    if (!options.some((option) => option.id === selectedOptionId)) setSelectedOptionId(options[0]?.id ?? '');
  }, [options, selectedOptionId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOptionId || !selectedStakePence || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit?.(market.id, selectedOptionId, selectedStakePence / 100, selectedStakePence, comment.trim());
      setComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className={`bet-card bet-market-focus card ${isOpen ? 'is-open' : `is-${market.status}`}`}>
      <div className="bet-market-kicker">
        <span>{marketTypeLabel(market)}</span>
        <b>{betMarketUiStatusLabel(market)}</b>
      </div>
      <div className="bet-card-title">
        <div>
          <h3>{market.title}</h3>
          <p>{round ? `${formatShortDate(round.roundDate)} · ${round.courseName ?? `Round ${round.roundNumber}`} · ${formatTeeTimeDisplay(round.teeTime)}` : closeLabel(market.closesAt)}</p>
        </div>
        <span>{formatPenceCurrency(potPence)} pot</span>
      </div>
      {market.description && <p className="bet-market-description">{market.description}</p>}

      {market.status === 'settled' && winningOption ? <div className="settled-market-summary">
        <div><span>Winner</span><strong>{market.resultText || winningOption.label}</strong></div>
        <div><span>Pot</span><strong>{formatPenceCurrency(potPence)}</strong></div>
        <div><span>Winning return</span><strong>{winningBets.length > 0 ? formatPenceCurrency(winningPayoutPence) : '—'}</strong></div>
      </div> : null}

      {isOpen ? <form className="quick-bet-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>1. Make your pick</legend>
          <div className="bet-option-choice-grid">
            {optionStakeRows.map((row) => <button type="button" className={selectedOptionId === row.option.id ? 'selected' : ''} aria-pressed={selectedOptionId === row.option.id} onClick={() => setSelectedOptionId(row.option.id)} key={row.option.id}>
              <span>{row.option.label}</span>
              <small>{row.optionBets.length} pick{row.optionBets.length === 1 ? '' : 's'} · {formatPenceCurrency(row.totalPence)}</small>
            </button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>2. Choose your stake</legend>
          <div className="bet-stake-choice-grid">
            {stakeChoices.map((stake) => <button type="button" className={selectedStakePence === stake ? 'selected' : ''} aria-pressed={selectedStakePence === stake} onClick={() => setSelectedStakePence(stake)} key={stake}>{formatPenceCurrency(stake)}</button>)}
          </div>
        </fieldset>
        <details className="bet-comment-details">
          <summary>Add a comment</summary>
          <label>Comment <span>(optional)</span><input value={comment} placeholder="Add a note for the group" onChange={(event) => setComment(event.target.value)} /></label>
        </details>
        <button className="place-bet-button" disabled={!bettorName.trim() || !selectedOptionId || isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : bettorName.trim() ? `Place ${formatPenceCurrency(selectedStakePence)} bet` : 'Choose your name first'}
        </button>
        <small className="bet-close-copy">{closeLabel(market.closesAt)}. You can add another bet or edit this pick before the market closes.</small>
        {submitMessage && <p className={/could not|error|invalid/i.test(submitMessage) ? 'form-error' : 'form-success'}>{submitMessage}</p>}
      </form> : null}

      {market.status === 'open' && !isOpen ? <p className="settled">Betting has closed. This market is waiting for the round result.</p> : null}
      {market.status === 'closed' ? <p className="settled">Betting has closed. This market is waiting for the round result.</p> : null}

      <details className="bet-transparency-details">
        <summary>{market.status === 'settled' ? 'See winning bets' : `See all current picks (${activeBets.length})`}</summary>
        <div className="bet-log premium-inset">
          {(market.status === 'settled' ? winningBets : activeBets).length === 0 ? <p>{market.status === 'settled' ? 'No winning bets.' : 'No picks logged yet.'}</p> : (market.status === 'settled' ? winningBets : activeBets).map((bet) => {
            const indicativePayout = payoutSummary.payouts.get(bet.id);
            return <p key={bet.id}><strong>{bet.bettorName}</strong>{market.status !== 'settled' ? ` → ${options.find((option) => option.id === bet.optionId)?.label ?? 'Option'}` : ''} <em>{formatStakeCurrency(bet)}</em>{market.status === 'settled' && indicativePayout !== undefined ? ` · return ${formatPenceCurrency(indicativePayout)}` : ''}{bet.comment && ` — ${bet.comment}`}</p>;
          })}
        </div>
      </details>
    </article>
  );
}
