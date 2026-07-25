import type { CSSProperties } from 'react';
import { PageHeader } from '../components/PageHeader';
import { formatTeeTimeDisplay } from '../lib/display';
import { formatDate } from '../lib/formatting';
import { logoutPublicAccess } from '../lib/publicAccess';
import { fetchPublicTourInfo, type PublicTourInfoResponse, type TourTeamDayKit } from '../lib/publicApi';
import { normalizeTeamColour } from '../lib/teamColours';
import { buildTourSchedule, manualItineraryKindLabels, type TourScheduleEntry } from '../lib/tourItinerary';
import type { TourTeam } from '../lib/types';
import { usePublicData } from '../lib/usePublicData';

const emptyTourInfo: Omit<PublicTourInfoResponse, 'source'> = {
  rounds: [],
  handbookSections: [],
  itineraryItems: [],
  teamDayKit: [],
  tourTeams: [],
  players: [],
  roundPrizeResults: [],
};

export function TourInfo() {
  const { data, loading, error } = usePublicData(fetchPublicTourInfo);
  const activeData = data ?? emptyTourInfo;
  const tour = activeData.tour;
  const schedule = tour ? buildTourSchedule(tour.id, activeData.rounds, activeData.itineraryItems) : [];
  const datedGroups = scheduleGroups(schedule, activeData.teamDayKit);

  return <div className="page-stack handbook-page">
    <PageHeader title="Tour itinerary" eyebrow={tour?.name ?? 'Tour schedule'} />
    {loading ? <p className="card">Loading tour itinerary…</p> : null}
    {error ? <p className="card form-error">{error}</p> : null}
    <section className="handbook-hero card">
      <div>
        <p className="eyebrow">Where to be and when</p>
        <h3>{tour?.location ?? 'Location TBC'}</h3>
        <p>{formatDate(tour?.startDate)} — {formatDate(tour?.endDate)}</p>
        {!loading && !error && !tour ? <p>Tour details TBC.</p> : null}
      </div>
      <span className="brand-logo-roundel info-logo-mark"><img className="brand-logo" src="/brand/roegusta-logo-mark.png" alt="Roegusta Tour mark" /></span>
    </section>
    <section className="card tour-itinerary-card">
      <div className="section-heading"><div><p className="eyebrow">Schedule</p><h2>Tour itinerary</h2></div></div>
      {datedGroups.length === 0 ? <p>Itinerary TBC.</p> : <div className="itinerary-day-list">{datedGroups.map((group) => <section className="itinerary-day" key={group.date}>
        <header className="itinerary-day-header">
          <h3>{group.label}</h3>
          <TeamKitChips kits={group.kits} teams={activeData.tourTeams} />
        </header>
        {group.entries.length > 0 ? <div className="itinerary-event-list">{group.entries.map((entry) => <ScheduleEntry entry={entry} key={entry.id} />)}</div> : <p className="muted">No timed activity added.</p>}
      </section>)}</div>}
    </section>
    <footer className="subtle-admin-link"><button type="button" onClick={() => { void logoutPublicAccess().finally(() => window.location.assign('/')); }}>Reset tour access</button><a href="/admin">Admin</a></footer>
  </div>;
}

function ScheduleEntry({ entry }: { entry: TourScheduleEntry }) {
  const label = entry.kind === 'golf' ? 'Golf' : manualItineraryKindLabels[entry.kind];
  const time = entry.kind === 'golf'
    ? `First tee ${formatTeeTimeDisplay(entry.timeLabel)}`
    : entry.timeLabel ?? (entry.kind === 'accommodation' ? 'Stay' : 'Time TBC');
  return <article className={`itinerary-event itinerary-event-${entry.kind}`}>
    <div className="itinerary-event-time"><span>{time}</span><small>{label}</small></div>
    <div>
      <strong>{entry.activity}{entry.kind !== 'golf' && entry.isPlaceholder && !/tbc/i.test(entry.activity) ? ' · TBC' : ''}</strong>
      {entry.location ? <p>{entry.location}</p> : null}
      {entry.notes ? <p>{entry.notes}</p> : null}
    </div>
  </article>;
}

function scheduleGroups(schedule: TourScheduleEntry[], kit: TourTeamDayKit[]) {
  const dates = [...new Set([
    ...schedule.map((entry) => entry.itemDate ?? 'date-tbc'),
    ...kit.map((item) => item.kitDate),
  ])].sort((a, b) => (a === 'date-tbc' ? 1 : b === 'date-tbc' ? -1 : a.localeCompare(b)));
  return dates.map((date) => {
    const entries = schedule.filter((entry) => (entry.itemDate ?? 'date-tbc') === date);
    return {
      date,
      label: entries.find((entry) => entry.dayLabel)?.dayLabel ?? (date === 'date-tbc' ? 'Date TBC' : formatDate(date)),
      entries,
      kits: kit.filter((item) => item.kitDate === date),
    };
  });
}

function TeamKitChips({ kits, teams }: { kits: TourTeamDayKit[]; teams: TourTeam[] }) {
  if (kits.length === 0) return null;
  return <div className="team-kit-chip-list" aria-label="Team shirt colours">{kits.map((kit, index) => {
    const team = teams.find((candidate) => candidate.id === kit.teamId);
    return <span className="team-kit-chip" key={kit.id} style={{ '--team-colour': normalizeTeamColour(team?.colour, index) } as CSSProperties}><i aria-hidden="true" />{team?.name ?? 'Team TBC'} · {kit.colourLabel}</span>;
  })}</div>;
}
