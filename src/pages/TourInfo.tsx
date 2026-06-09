import { formatDate } from '../lib/formatting';
import { fetchPublicTourInfo, type PublicTourInfoResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

const emptyTourInfo: Omit<PublicTourInfoResponse, 'source'> = { rounds: [], handbookSections: [], itineraryItems: [], teamDayKit: [], tourTeams: [] };

export function TourInfo() {
  const { data, loading, error } = usePublicData(fetchPublicTourInfo);
  const activeData = data ?? emptyTourInfo;
  const tour = activeData.tour;

  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Tour handbook</p><h2>{tour?.name ?? 'Roegusta Tour'}</h2></section>
    {loading && <p className="card">Loading tour handbook…</p>}
    {error && <p className="card form-error">{error}</p>}
    <section className="card"><h3>Details</h3>{!loading && !error && !tour ? <p>No live data has been added yet.</p> : <><p>{tour?.location ?? 'Location TBC'}</p><p>{formatDate(tour?.startDate)} — {formatDate(tour?.endDate)}</p>{tour?.description && <p>{tour.description}</p>}</>}</section>
    <section className="card"><h3>Courses</h3>{activeData.rounds.length === 0 ? <p>Round details will appear once added.</p> : activeData.rounds.map((round) => <p key={round.id}>{round.name}: {round.courseName ?? 'Course TBC'} · {round.teeTime ?? 'TBC'}</p>)}</section>
    <section className="card"><h3>Handbook</h3>{activeData.handbookSections.length === 0 ? <p>Tour handbook details will appear once added.</p> : activeData.handbookSections.map((section) => <article key={section.id}><h4>{section.title}</h4>{section.body && <p>{section.body}</p>}</article>)}</section>
    <section className="card"><h3>Itinerary</h3>{activeData.itineraryItems.length === 0 ? <p>Tour handbook details will appear once added.</p> : <ul>{activeData.itineraryItems.map((item) => <li key={item.id}><strong>{item.dayLabel ?? formatDate(item.itemDate)} {item.timeLabel ? `· ${item.timeLabel}` : ''}</strong>: {item.activity}{item.location ? ` · ${item.location}` : ''}{item.notes ? ` — ${item.notes}` : ''}{item.isPlaceholder ? ' (TBC)' : ''}</li>)}</ul>}</section>
    {activeData.teamDayKit.length > 0 && <section className="card"><h3>Team kit</h3>{activeData.teamDayKit.map((kit) => <p key={kit.id}>{formatDate(kit.kitDate)} · {activeData.tourTeams.find((team) => team.id === kit.teamId)?.name ?? 'Team TBC'} · {kit.colourLabel}</p>)}</section>}
    <section className="card"><h3>Rules</h3><p>One match result is entered by admin. Team score and individual records are derived automatically from completed matches.</p><p>Betting markets are a lightweight visible log only: no payments, wallets or bookmaker functionality.</p></section>
    <footer className="subtle-admin-link"><a href="/admin">Admin</a></footer>
  </div>;
}
