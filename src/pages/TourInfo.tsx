import { currentTourId, itinerary, rounds, tours } from '../data/mockData';
import { formatDate } from '../lib/formatting';

export function TourInfo() {
  const tour = tours.find((item) => item.id === currentTourId)!;
  const tourRounds = rounds.filter((round) => round.tourId === currentTourId);
  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Tour handbook</p><h2>{tour.name}</h2></section><section className="card"><h3>Details</h3><p>{tour.location}</p><p>{formatDate(tour.startDate)} — {formatDate(tour.endDate)}</p><p>{tour.description}</p></section><section className="card"><h3>Courses</h3>{tourRounds.map((round) => <p key={round.id}>{round.name}: {round.courseName} · {round.teeTime ?? 'TBC'}</p>)}</section><section className="card"><h3>Itinerary</h3><ul>{itinerary.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="card"><h3>Rules</h3><p>One match result is entered by admin. Team score and individual records are derived automatically from completed matches.</p><p>Betting markets are a lightweight visible log only: no payments, wallets or bookmaker functionality.</p></section><section className="card"><h3>Notes</h3><p>Future tour editions can reuse permanent players while assigning new tour-specific teams and rosters.</p></section></div>;
}
