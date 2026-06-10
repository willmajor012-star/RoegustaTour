import { formatDate } from '../lib/formatting';
import { fetchPublicTourInfo, type PublicTourInfoResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

const emptyTourInfo: Omit<PublicTourInfoResponse, 'source'> = { rounds: [], handbookSections: [], itineraryItems: [], teamDayKit: [], tourTeams: [] };

export function TourInfo() {
  const { data, loading, error } = usePublicData(fetchPublicTourInfo);
  const activeData = data ?? emptyTourInfo;
  const tour = activeData.tour;

  return <div className="page-stack handbook-page"><section className="page-title premium-title"><p className="eyebrow">Tour handbook</p><h2>{tour?.name ?? 'Handbook'}</h2><p>Itinerary, courses, kit notes and tour details in one polished public guide.</p></section>
    {loading && <p className="card">Loading tour handbook…</p>}
    {error && <p className="card form-error">{error}</p>}
    <section className="handbook-hero card"><div><p className="eyebrow">Details</p><h3>{tour?.location ?? 'Location TBC'}</h3><p>{formatDate(tour?.startDate)} — {formatDate(tour?.endDate)}</p>{tour?.description && <p>{tour.description}</p>}{!loading && !error && !tour && <p>No live data has been added yet.</p>}</div><img src="/brand/roegusta-logo-square.png" alt="Roegusta" /></section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Course guide</p><h2>Rounds</h2></div></div>{activeData.rounds.length === 0 ? <p>Round details will appear once added.</p> : <div className="premium-list">{activeData.rounds.map((round) => <div className="premium-list-row" key={round.id}><strong>Round {round.roundNumber}: {round.name}</strong><span>{round.courseName ?? 'Course TBC'} · {round.teeTime ?? 'TBC'}</span></div>)}</div>}</section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Handbook</p><h2>Key notes</h2></div></div>{activeData.handbookSections.length === 0 ? <p>Tour handbook details will appear once added.</p> : <div className="handbook-section-grid">{activeData.handbookSections.map((section) => <article className="handbook-note" key={section.id}><h4>{section.title}</h4>{section.body && <p>{section.body}</p>}</article>)}</div>}</section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Schedule</p><h2>Itinerary</h2></div></div>{activeData.itineraryItems.length === 0 ? <p>Tour handbook details will appear once added.</p> : <div className="timeline-list">{activeData.itineraryItems.map((item) => <article className="timeline-item" key={item.id}><span>{item.dayLabel ?? formatDate(item.itemDate)}</span><div><strong>{item.timeLabel ? `${item.timeLabel} · ` : ''}{item.activity}</strong>{item.location && <p>{item.location}</p>}{item.notes && <p>{item.notes}</p>}{item.isPlaceholder && <em>TBC</em>}</div></article>)}</div>}</section>
    {activeData.teamDayKit.length > 0 && <section className="card"><div className="section-heading"><div><p className="eyebrow">Team kit</p><h2>Daily colours</h2></div></div><div className="premium-list">{activeData.teamDayKit.map((kit) => <div className="premium-list-row" key={kit.id}><strong>{formatDate(kit.kitDate)}</strong><span>{activeData.tourTeams.find((team) => team.id === kit.teamId)?.name ?? 'Team TBC'} · {kit.colourLabel}</span></div>)}</div></section>}
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Rules</p><h2>Public notes</h2></div></div><p>One match result is entered by admin. Team score and individual records are derived automatically from completed matches.</p><p>Bet Punto markets are a lightweight visible log only: no payments, wallets or bookmaker functionality.</p></section>
    <footer className="subtle-admin-link"><a href="/admin">Admin</a></footer>
  </div>;
}
