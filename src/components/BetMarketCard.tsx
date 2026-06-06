import { type FormEvent, useState } from 'react';
import type { Bet, BetMarket, BetOption } from '../lib/types';

type Props = {
  market: BetMarket;
  options: BetOption[];
  bets: Bet[];
  bettorName: string;
  onSubmit?: (marketId: string, optionId: string, stakeText: string, comment: string) => void;
};

export function BetMarketCard({ market, options, bets, bettorName, onSubmit }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? '');
  const [stakeText, setStakeText] = useState('');
  const [comment, setComment] = useState('');
  const activeBets = bets.filter((bet) => bet.marketId === market.id && bet.status === 'active');
  const isOpen = market.status === 'open';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOptionId || !stakeText.trim()) return;
    onSubmit?.(market.id, selectedOptionId, stakeText.trim(), comment.trim());
    setStakeText('');
    setComment('');
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
            Stake text
            <input value={stakeText} placeholder="e.g. one post-round pint" onChange={(event) => setStakeText(event.target.value)} />
          </label>
          <label>
            Comment <span>(optional)</span>
            <input value={comment} placeholder="Add a note for the group" onChange={(event) => setComment(event.target.value)} />
          </label>
          <button disabled={!bettorName.trim() || !stakeText.trim()} type="submit">Submit social pick</button>
          {!bettorName.trim() && <small>Enter your name above before submitting.</small>}
        </form>
      ) : (
        <div className="option-list">{options.map((option) => <span className="pill" key={option.id}>{option.label}</span>)}</div>
      )}
      <div className="bet-log">
        <strong>Backed by</strong>
        {activeBets.length === 0 ? <p>No active selections yet.</p> : activeBets.map((bet) => <p key={bet.id}>{bet.bettorName} → {options.find((option) => option.id === bet.optionId)?.label} <em>{bet.stakeText}</em>{bet.comment && ` — ${bet.comment}`}</p>)}
      </div>
    </article>
  );
}
