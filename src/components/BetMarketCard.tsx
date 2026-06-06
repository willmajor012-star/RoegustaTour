import { type FormEvent, useState } from 'react';
import { formatStakeCurrency, parseStakeAmount, stakeAmountToPence } from '../lib/betting';
import type { Bet, BetMarket, BetOption } from '../lib/types';

type Props = {
  market: BetMarket;
  options: BetOption[];
  bets: Bet[];
  bettorName: string;
  onSubmit?: (marketId: string, optionId: string, stakeAmount: number, stakeAmountPence: number, comment: string) => void;
};

export function BetMarketCard({ market, options, bets, bettorName, onSubmit }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? '');
  const [stakeInput, setStakeInput] = useState('');
  const [comment, setComment] = useState('');
  const [stakeTouched, setStakeTouched] = useState(false);
  const activeBets = bets.filter((bet) => bet.marketId === market.id && bet.status === 'active');
  const isOpen = market.status === 'open';
  const parsedStake = parseStakeAmount(stakeInput);
  const hasStakeError = stakeTouched && stakeInput.trim().length > 0 && parsedStake === null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStakeTouched(true);
    if (!selectedOptionId || parsedStake === null) return;
    onSubmit?.(market.id, selectedOptionId, parsedStake, stakeAmountToPence(parsedStake), comment.trim());
    setStakeInput('');
    setComment('');
    setStakeTouched(false);
  };

  return (
    <article className="bet-card card">
      <div className="card-meta"><span>{market.marketType.replace('_', ' ')}</span><span>{market.status}</span></div>
      <h3>{market.title}</h3>
      {market.description && <p>{market.description}</p>}
      {market.resultText && <p className="settled">Result: {market.resultText}</p>}
      {isOpen ? (
        <form className="bet-form" onSubmit={handleSubmit}>
          <label>
            Pick an option
            <select value={selectedOptionId} onChange={(event) => setSelectedOptionId(event.target.value)}>
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Stake (£)
            <input inputMode="decimal" value={stakeInput} placeholder="e.g. 5 or 10" onBlur={() => setStakeTouched(true)} onChange={(event) => setStakeInput(event.target.value)} />
            {hasStakeError && <small className="form-error">Enter a numeric stake amount in pounds only.</small>}
          </label>
          <label>
            Comment <span>(optional)</span>
            <input value={comment} placeholder="Add a note for the group" onChange={(event) => setComment(event.target.value)} />
          </label>
          <button disabled={!bettorName.trim() || parsedStake === null} type="submit">Submit social pick</button>
          {!bettorName.trim() && <small>Enter your name above before submitting.</small>}
          <small>No wallet, no payment handling, no money transfer — this app only logs bets.</small>
        </form>
      ) : (
        <div className="option-list">{options.map((option) => <span className="pill" key={option.id}>{option.label}</span>)}</div>
      )}
      <div className="bet-log">
        <strong>Backed by</strong>
        {activeBets.length === 0 ? <p>No active selections yet.</p> : activeBets.map((bet) => <p key={bet.id}>{bet.bettorName} → {options.find((option) => option.id === bet.optionId)?.label} <em>{formatStakeCurrency(bet)}</em>{bet.comment && ` — ${bet.comment}`}</p>)}
      </div>
    </article>
  );
}
