import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { betMarketUiStatusLabel, betPuntoMarketKind, betPuntoMarketKindLabel, buildMarketOptionStakeRows, calculateIndicativePayouts, calculateMarketPotPence, formatPenceCurrency, formatStakeCurrency, isMarketPubliclyEditable, parseStakeAmount, stakeAmountToPence } from '../lib/betting';
import type { Bet, BetMarket, BetOption, Round } from '../lib/types';
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

export function BetMarketCard({ market, round, options, bets, bettorName, onSubmit, submitMessage }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? '');
  const [stakeInput, setStakeInput] = useState('');
  const [comment, setComment] = useState('');
  const [stakeTouched, setStakeTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeBets = bets.filter((bet) => bet.marketId === market.id && bet.status === 'active');
  const isOpen = isMarketPubliclyEditable(market);
  const marketKind = betPuntoMarketKind(market);
  const parsedStake = parseStakeAmount(stakeInput);
  const hasStakeError = stakeTouched && stakeInput.trim().length > 0 && parsedStake === null;
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
    setStakeTouched(true);
    if (!selectedOptionId || parsedStake === null || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit?.(market.id, selectedOptionId, parsedStake, stakeAmountToPence(parsedStake), comment.trim());
      setStakeInput('');
      setComment('');
      setStakeTouched(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="bet-card card">
      <div className="card-meta"><span>{betPuntoMarketKindLabel(marketKind)}</span>{round && <span>Round {round.roundNumber}{round.roundDate ? ` · ${round.roundDate}` : ''}{round.teeTime ? ` · ${formatTeeTimeDisplay(round.teeTime)}` : ''}</span>}<span>{market.marketScope === 'general_pot' ? 'General pot' : 'Special/manual'}</span><span>{betMarketUiStatusLabel(market)}</span></div>
      <div className="bet-card-title"><h3>{market.title}</h3><span>{formatPenceCurrency(potPence)} pot</span></div>
      {market.description && <p>{market.description}</p>}
      {market.status !== 'settled' && market.resultText && <p className="settled">Result: {market.resultText}</p>}
      {market.status === 'settled' && winningOption ? <div className="settled-market-summary">
        <div><span>Winner</span><strong>{market.resultText || winningOption.label}</strong></div>
        <div><span>Pot</span><strong>{formatPenceCurrency(potPence)}</strong></div>
        <div><span>Winning return</span><strong>{winningBets.length > 0 ? formatPenceCurrency(winningPayoutPence) : '—'}</strong></div>
      </div> : null}
      {market.status === 'open' && !isOpen ? <p className="settled">Locked / awaiting result. The close time has passed, so public bets, edits and cancellations are disabled while an admin enters the result.</p> : null}
      {market.status === 'closed' ? <p className="settled">Closed / awaiting result. This market is no longer taking bets and is waiting for admin result.</p> : null}
      {isOpen ? (
        <>
        <div className="table-wrap">
          <table className="bet-summary-table">
            <thead><tr><th>Option</th><th>Total staked</th><th>Bets</th><th>Bettors / stakes</th></tr></thead>
            <tbody>{optionStakeRows.map((row) => <tr key={row.option.id}><td>{row.option.label}</td><td>{formatPenceCurrency(row.totalPence)}</td><td>{row.optionBets.length}</td><td>{row.optionBets.length === 0 ? 'No stakes yet' : row.optionBets.map((bet) => `${bet.bettorName} ${formatStakeCurrency(bet)}`).join(', ')}</td></tr>)}</tbody>
          </table>
        </div>
        <form className="bet-form" onSubmit={handleSubmit}>
          <label>
            Pick an option
            <select value={selectedOptionId} onChange={(event) => setSelectedOptionId(event.target.value)}>
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}{option.oddsDecimal ? ` · ${option.oddsDecimal}x` : ''}</option>)}
            </select>
          </label>
          <label>
            Stake (£)
            <input inputMode="decimal" value={stakeInput} placeholder="e.g. 5, 7.50 or 10" onBlur={() => setStakeTouched(true)} onChange={(event) => setStakeInput(event.target.value)} />
            {hasStakeError && <small className="form-error">Enter a numeric stake amount in pounds and pence.</small>}
          </label>
          <label>
            Comment <span>(optional)</span>
            <input value={comment} placeholder="Add a note for the group" onChange={(event) => setComment(event.target.value)} />
          </label>
          <button disabled={!bettorName.trim() || parsedStake === null || isSubmitting} type="submit">{isSubmitting ? 'Saving…' : 'Submit Bet Punto pick'}</button>
          {!bettorName.trim() && <small>Enter your name above before submitting.</small>}
          {submitMessage && <small>{submitMessage}</small>}
        </form>
        </>
      ) : null}
      {!isOpen && market.status !== 'settled' ? <div className="table-wrap"><table className="bet-summary-table"><thead><tr><th>Option</th><th>Total staked</th><th>Bets</th><th>Bettors / stakes</th></tr></thead><tbody>{optionStakeRows.map((row) => <tr key={row.option.id}><td>{row.option.label}</td><td>{formatPenceCurrency(row.totalPence)}</td><td>{row.optionBets.length}</td><td>{row.optionBets.length === 0 ? 'No stakes logged' : row.optionBets.map((bet) => `${bet.bettorName} ${formatStakeCurrency(bet)}`).join(', ')}</td></tr>)}</tbody></table></div> : null}
      <div className="bet-log premium-inset">
        <strong>{market.status === 'settled' ? 'Winning bets' : 'Backed by'}</strong>
        {(market.status === 'settled' ? winningBets : activeBets).length === 0 ? <p>{market.status === 'settled' ? 'No winning bets.' : 'No picks logged yet.'}</p> : (market.status === 'settled' ? winningBets : activeBets).map((bet) => {
          const indicativePayout = payoutSummary.payouts.get(bet.id);
          return <p key={bet.id}>{bet.bettorName}{market.status !== 'settled' ? ` → ${options.find((option) => option.id === bet.optionId)?.label ?? 'Option'}` : ''} <em>{formatStakeCurrency(bet)}</em>{market.status === 'settled' && indicativePayout !== undefined ? ` · return ${formatPenceCurrency(indicativePayout)}` : ''}{bet.comment && ` — ${bet.comment}`}</p>;
        })}
        {market.status === 'settled' && market.marketScope === 'special' && winningOption && !winningOption.oddsDecimal && <p>Special return is manual: use the result notes for indicative tracking.</p>}
      </div>
    </article>
  );
}
