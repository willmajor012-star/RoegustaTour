import { PrizePayouts } from './PrizePayouts';
import { useState } from 'react';
import { competitionStandings, entryLabel, type GolfCompetition, type GolfSession, type OpsBundle, type PlayingGroup } from '../lib/tourOperations';
import { formatShortDate } from '../lib/formatting';
import { PairingRow } from './PairingRow';
import { useTourOperations } from './TourOperations';
import { TourLink } from './TourLink';

const labels: Record<string, string> = { combined: 'Combined pairs', par3: 'Par 3', saturday: 'Saturday pairs', sunday: 'Sunday singles' };
export function CompetitionStandings({ competition: c, bundle: b, sessionKey }: { competition: GolfCompetition; bundle: OpsBundle; sessionKey?: string }) {
  const rows = competitionStandings(c, b.courses, sessionKey ?? 'combined');
  const sessions = sessionKey ? c.sessions.filter((s) => s.key === sessionKey) : c.sessions;
  const hasResults = rows.some((r) => Object.values(r.sessions).some((s) => s.started));
  if (!c.entriesPublished || !rows.length) return <p className="card competition-empty">Pairings to follow.</p>;
  if (!hasResults) return <p className="card competition-empty">Results will appear after play.</p>;
  return <div className="competition-standings">{rows.map((r) => <article className="card competition-standing" key={r.entry.id}>
    <header><span className="competition-rank">{r.rank ?? '–'}</span><div><strong>{entryLabel(r.entry, b.players)}</strong><small>{b.teams.find((t) => t.id === r.entry.teamId)?.name ?? (c.key === 'par3' ? 'Par 3 pair' : '')}</small></div>{!sessionKey && r.points !== undefined && c.pointAwards.length ? <span className={r.confirmed ? 'competition-points' : 'competition-points score-provisional'}>{r.points} pts{!r.confirmed ? <small>Provisional</small> : null}</span> : null}</header>
    <dl className="competition-totals">{sessions.map((s) => <div key={s.id}><dt>{s.key === 'friday' ? 'Friday' : s.key === 'monday' ? 'Monday' : 'Stableford'}</dt><dd>{r.sessions[s.key].started ? r.sessions[s.key].total : 'Not started'}</dd><small>{r.sessions[s.key].complete}/{s.holes} holes</small></div>)}{sessions.length > 1 ? <div><dt>Total</dt><dd>{r.total}</dd></div> : null}</dl>
    {r.rank && /Monday|Last|Final|Admin decision/.test(r.explanation) ? <small className="competition-countback">{r.explanation.startsWith('Admin decision') ? 'GameBook countback' : r.explanation}</small> : !r.rank && r.complete ? <small>Tied position</small> : null}
  </article>)}</div>;
}
export function PublicTeeSheet({ competition: c, session: s, bundle: b }: { competition: GolfCompetition; session: GolfSession; bundle: OpsBundle }) {
  const groups: PlayingGroup[] = s.groups.length ? s.groups : Array.from({ length: 6 }, (_, i) => ({ id: String(i), number: i + 1, time: s.startType === 'shotgun' ? s.firstStart : s.teeInterval !== undefined ? (() => { const [h, m] = s.firstStart.split(':').map(Number); const n = h * 60 + m + i * s.teeInterval!; return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; })() : i === 0 ? s.firstStart : undefined, entryIds: [] }));
  return <section className="card public-tee-sheet">
    <div className="section-heading"><div><p className="eyebrow">{formatShortDate(s.date)}</p><h3>{s.title}</h3></div></div>
    <p>{s.courseName}{s.startType === 'shotgun' ? ' · Shotgun start' : ''}</p>
    <div className="public-tee-groups">{groups.map((g) => {
      const entries = s.groupsPublished && c.entriesPublished ? g.entryIds.flatMap((id) => {
        const entry = c.entries.find((e) => e.id === id);
        if (!entry) return [];
        const team = c.key === 'par3' ? undefined : b.teams.find((t) => t.id === entry.teamId);
        return [{ id, team, names: entryLabel(entry, b.players), label: c.key === 'par3' ? 'Par 3 pair' : 'Side unassigned' }];
      }) : [];
      const label = `Group ${g.number}${entries.length > 0 && s.startType === 'shotgun' && g.startingHole !== undefined ? ` · Tee ${g.startingHole}` : ''}`;
      // Each singles fourball contains two separate matches in saved opponent order.
      const lineups = c.entryKind === 'individual' && entries.length === 4 ? [entries.slice(0, 2), entries.slice(2)] : [entries];
      return <PairingRow key={g.id} time={g.time ?? 'TBC'} label={label} detail={entries.length ? undefined : 'Pairings to follow'} lineups={entries.length ? lineups : []} />;
    })}</div>
  </section>;
}
export function PublicCompetitionPanel({ teeSheets = false }: { teeSheets?: boolean }) {
  const { bundle: b, error } = useTourOperations(); const [key, setKey] = useState('combined');
  if (error) return <p className="card form-error">Results could not be loaded. Please refresh.</p>;
  if (!b) return <p className="card">Loading results…</p>;
  const c = b.state.competitions.find((c) => c.key === key) ?? b.state.competitions[0];
  if (!c) return <p className="card">Results to follow.</p>;
  return <div className="public-competition"><nav className="public-tabs competition-tabs" aria-label="Competition">{b.state.competitions.map((c) => <button type="button" key={c.id} aria-pressed={c.key === key} onClick={() => setKey(c.key)}>{labels[c.key] ?? c.title}</button>)}</nav>{teeSheets ? c.sessions.map((s) => <PublicTeeSheet key={s.id} competition={c} session={s} bundle={b} />) : <><h3>{labels[c.key] ?? c.title}</h3><CompetitionStandings competition={c} bundle={b} /><PrizePayouts fund={b.tour.prizeFund} poolKey={c.key} /></>}</div>;
}
export function PublicRoundResults({ roundId, groups = false }: { roundId: string; groups?: boolean }) {
  const { bundle: b, error } = useTourOperations();
  if (error || !b) return <p className="card">{error ? 'Results could not be loaded.' : 'Loading…'}</p>;
  const c = b.state.competitions.find((c) => c.sessions.some((s) => s.roundId === roundId)); const s = c?.sessions.find((s) => s.roundId === roundId);
  if (!c || !s) return null;
  return <div className="public-competition">{groups ? <PublicTeeSheet competition={c} session={s} bundle={b} /> : <CompetitionStandings competition={c} bundle={b} sessionKey={s.key} />}<TourLink href="/tours/current/leaderboard" title="Tour leaderboard" /></div>;
}
