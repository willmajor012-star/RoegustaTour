import type { Bet, BetMarket, BetOption } from '../lib/types';

type Props = { market: BetMarket; options: BetOption[]; bets: Bet[]; bettorName: string; onSubmit?: (marketId: string, optionId: string, stakeText: string, comment: string) => void };
export function BetMarketCard({ market, options, bets, bettorName, onSubmit }: Props) {
  const activeBets = bets.filter((bet) => bet.marketId === market.id);
  return <article className="bet-card card"><div className="card-meta"><span>{market.marketType.replace('_', ' ')}</span><span>{market.status}</span></div><h3>{market.title}</h3>{market.description && <p>{market.description}</p>}
    {market.resultText && <p className="settled">Result: {market.resultText}</p>}
    <div className="option-list">{options.map((option) => <button disabled={market.status !== 'open'} key={option.id} onClick={() => onSubmit?.(market.id, option.id, 'Tour stake', '')}>{option.label}</button>)}</div>
    <div className="bet-log"><strong>Backed by</strong>{activeBets.length === 0 ? <p>No selections yet. {bettorName && 'Be first on this device.'}</p> : activeBets.map((bet) => <p key={bet.id}>{bet.bettorName} → {options.find((option) => option.id === bet.optionId)?.label} <em>{bet.stakeText}</em>{bet.comment && ` — ${bet.comment}`}</p>)}</div>
  </article>;
}
