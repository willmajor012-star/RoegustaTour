import type { TourPrizeFund } from '../lib/types';

export function PrizePayouts({ fund, roundNumber, poolKey }: { fund?: TourPrizeFund; roundNumber?: number; poolKey?: string }) {
  const payout = fund?.rounds.find((p) => poolKey ? p.poolKey === poolKey : p.roundNumber === roundNumber);
  if (!payout) return null;
  const legacy = fund?.programmeVersion !== 'confirmed-2026';
  const money = (p: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: p % 100 ? 2 : 0 }).format(p / 100);
  return <div className="prize-fund-card">
    <div className="prize-fund-summary">{legacy && fund?.contributionPence !== undefined ? <span><small>Contribution</small><strong>{money(fund.contributionPence)} each</strong></span> : null}<span><small>Cash prizes</small><strong>Per {payout.paidPer === 'player' ? 'player' : 'pair'}</strong></span><span><small>{legacy ? 'Total fund' : 'Prize fund'}</small><strong>{money(legacy && fund?.totalPence !== undefined ? fund.totalPence : payout.payoutsPence.reduce((a, b) => a + b, 0))}</strong></span></div>
    <div className="prize-payout-grid" aria-label={`${payout.title ?? 'Competition'} cash prizes`}>{payout.payoutsPence.map((amount, i) => <span key={i}><small>{i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}</small><strong>{money(amount)}</strong></span>)}</div>
    {legacy && !!fund?.rules.length ? <ul className="prize-fund-rules">{fund.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul> : null}
  </div>;
}
