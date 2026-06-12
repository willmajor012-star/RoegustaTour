import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { calculateIndicativePayouts, calculateMarketPotPence, formatPenceCurrency, formatStakeCurrency, parseStakeAmount, stakeAmountToPence } from '../lib/betting';
import type { Bet, BetMarket, BetOption, Round } from '../lib/types';

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
  const isOpen = market.status === 'open';
  const parsedStake = parseStakeAmount(stakeInput);
  const hasStakeError = stakeTouched && stakeInput.trim().length > 0 && parsedStake === null;
  const potPence = calculateMarketPotPence(market.id, bets);
  const payoutSummary = useMemo(() => calculateIndicativePayouts(market, options, bets), [market, options, bets]);
  const winningOption = options.find((option) => option.id === market.resultOptionId);

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
      <div className="card-meta"><span>{market.marketType.replace('_', ' ')}</span>{round && <span>Round {round.roundNumber}{round.roundDate ? ` · ${round.roundDate}` : ''}</span>}<span>{market.marketScope === 'general_pot' ? 'General pot' : 'Special/manual'}</span><span>{market.status}</span></div>
      <div className="bet-card-title"><h3>{market.title}</h3><span>{formatPenceCurrency(potPence)} pot</span></div>
      {market.description && <p>{market.description}</p>}
      {market.resultText && <p className="settled">Result: {market.resultText}</p>}
      {market.status === 'settled' && winningOption && <p className="settled">Winning option: {winningOption.label}</p>}
      {isOpen ? (
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
          <small>No wallet, no payment handling, no money transfer — this app only logs Bet Punto picks and indicative payouts.</small>
        </form>
      ) : (
        <div className="option-list">{options.map((option) => <span className="pill" key={option.id}>{option.label}{option.oddsDecimal ? ` · ${option.oddsDecimal}x` : ''}</span>)}</div>
      )}
      <div className="bet-log premium-inset">
        <strong>Backed by</strong>
        {activeBets.length === 0 ? <p>No picks logged yet.</p> : activeBets.map((bet) => {
          const indicativePayout = payoutSummary.payouts.get(bet.id);
          return <p key={bet.id}>{bet.bettorName} → {options.find((option) => option.id === bet.optionId)?.label} <em>{formatStakeCurrency(bet)}</em>{market.status === 'settled' && indicativePayout !== undefined ? ` · indicative payout ${formatPenceCurrency(indicativePayout)}` : ''}{bet.comment && ` — ${bet.comment}`}</p>;
        })}
        {market.status === 'settled' && market.marketScope === 'general_pot' && payoutSummary.winningStakeTotalPence === 0 && <p>No winning picks were logged for this pot.</p>}
        {market.status === 'settled' && market.marketScope === 'special' && winningOption && !winningOption.oddsDecimal && <p>Special payout is manual: use the result notes for indicative tracking.</p>}
      </div>
    </article>
  );
}
