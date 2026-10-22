import { useEffect, useState } from 'react';
import { competitionStandings, entryLabel, rankingBasis, type GolfCompetition, type GolfSession, type OpsBundle } from '../lib/tourOperations';
type Action = (action: string, payload: Record<string, unknown>) => Promise<void>;
type Props = { session: GolfSession; competition: GolfCompetition; bundle: OpsBundle; act: Action };

export function GameBookSession({ session: s }: Props) {
  return <section className="ops-session"><h3>{s.title}</h3><p>{s.courseName} · {s.holes} holes · {s.teeRequired === false ? 'No tee selection needed' : s.teeKey + ' tees'}</p><p>{s.holeOrder.length === 9 ? 'Front nine: holes 1–9.' : s.startType === 'shotgun' ? '18 holes. Shotgun start at ' + s.firstStart + '.' : '18 holes.'}</p><p>{s.handicapSettings.method === 'scratch' ? 'Scratch Stableford: no handicap strokes. Enter the final pair total from GameBook in Scores.' : 'GameBook handles scoring and handicap allowances. Enter its final Stableford totals in Scores.'}</p></section>;
}

export function GameBookTotals({ session: s, competition: c, bundle: b, act }: Props) {
  const [totals, setTotals] = useState(s.totals ?? []); const [dirty, setDirty] = useState(false);
  useEffect(() => { const prevent = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent); }, [dirty]);
  const entries = c.entries.filter((e) => e.playerIds.length);
  return <section className="ops-session"><h3>{s.title} · {s.holes} holes</h3><p>Copy the final {c.entryKind === 'pair' ? 'pair' : 'individual'} Stableford totals from GameBook. Blank means not entered; zero is a completed result. Friday and Monday totals are saved separately.</p>{entries.length ? <div className="table-wrap"><table><thead><tr><th>{c.entryKind === 'pair' ? 'Pair' : 'Golfer'}</th><th>GameBook Stableford total</th></tr></thead><tbody>{entries.map((e) => <tr key={e.id}><th>{entryLabel(e, b.players)}</th><td><input type="number" min="0" max="300" step="1" inputMode="numeric" aria-label={`${s.title} total for ${entryLabel(e, b.players)}`} value={totals.find((v) => v.entryId === e.id)?.stableford ?? ''} onChange={(event) => { const value = event.target.value; setTotals([...totals.filter((v) => v.entryId !== e.id), ...(value === '' ? [] : [{ entryId: e.id, stableford: Number(value), completedHoles: s.holes! }])]); setDirty(true); }} /></td></tr>)}</tbody></table></div> : <p>Assign the competition entries first.</p>}<button type="button" disabled={!dirty} onClick={() => void act('save_totals', { competitionId: c.id, sessionId: s.id, totals })}>{dirty ? 'Save GameBook totals' : 'Totals saved'}</button><p>For tied positions, copy GameBook’s finishing order in Tie decisions.</p></section>;
}

export function GameBookWinners({ competition: c, bundle: b, act }: Omit<Props, 'session'>) {
  return <section className="ops-session"><h3>Confirm betting winners</h3><p>Save the totals, then select the actual GameBook winner for each pool. Matchplay results and the combined tour ranking remain separate.</p>{b.markets.filter((m) => m.competitionKey === c.key).map((m) => <Winner key={m.id + ':' + b.version} marketId={m.id} competition={c} bundle={b} act={act} />)}</section>;
}
function Winner({ marketId, competition: c, bundle: b, act }: Omit<Props, 'session'> & { marketId: string }) {
  const market = b.markets.find((m) => m.id === marketId)!; const saved = b.state.manualPoolWinners?.[marketId];
  const [entryId, setEntryId] = useState(saved?.entryId ?? ''); const [confirmed, setConfirmed] = useState(false);
  const scope = market.sessionKey ?? 'combined'; const rows = competitionStandings(c, b.courses, scope, 'decision');
  const complete = c.entriesPublished && rows.length > 0 && rows.every((r) => r.complete);
  return <article className="ops-room"><h4>{market.title}</h4><label>GameBook winner<select value={entryId} onChange={(e) => { setEntryId(e.target.value); setConfirmed(false); }}><option value="">Choose winner</option>{c.entries.filter((e) => e.playerIds.length).map((e) => <option key={e.id} value={e.id}>{entryLabel(e, b.players)}</option>)}</select></label><label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> This is the actual GameBook winner.</label><button type="button" disabled={!complete || !entryId || !confirmed} onClick={() => void act('set_pool_winner', { competitionId: c.id, marketId, entryId, reason: 'Winner confirmed from GameBook' })}>Confirm winner & calculate payouts</button>{saved ? <button type="button" onClick={() => void act('set_pool_winner', { competitionId: c.id, marketId, entryId: '' })}>Clear winner</button> : null}<p>{!complete ? 'Save all relevant totals first.' : saved?.basis === rankingBasis(c, scope) ? market.status === 'settled' ? 'Winner confirmed. Ledger payouts calculated.' : 'Winner confirmed. Confirm again after cutoff to calculate payouts.' : saved ? 'Scores changed. Confirm the GameBook winner again.' : 'Winner not yet confirmed.'}</p></article>;
}
