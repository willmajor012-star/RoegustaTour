import { useState, type CSSProperties } from 'react';
import { PageHeader } from '../components/PageHeader';
import { courseGuidePath } from '../data/courseGuides';
import { formatTeeTimeDisplay } from '../lib/display';
import { formatLongDate } from '../lib/formatting';
import { logoutPublicAccess } from '../lib/publicAccess';
import { fetchPublicTourInfo, type PublicTourInfoResponse, type TourTeamDayKit } from '../lib/publicApi';
import { normalizeTeamColour } from '../lib/teamColours';
import { buildTourSchedule, formatItineraryTime, manualItineraryKindLabels, type TourScheduleEntry } from '../lib/tourItinerary';
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
  tourCourses: [],
};

export function TourInfo() {
  const { data, loading, error } = usePublicData(fetchPublicTourInfo);
  const [selectedDate, setSelectedDate] = useState('');
  const activeData = data ?? emptyTourInfo;
  const tour = activeData.tour;
  const schedule = tour ? buildTourSchedule(tour.id, activeData.rounds, activeData.itineraryItems) : [];
  const datedGroups = scheduleGroups(schedule, activeData.teamDayKit, tour?.startDate, tour?.endDate);
  const selectedGroup = datedGroups.find((group) => group.date === selectedDate) ?? datedGroups[0];

  return <div className="page-stack handbook-page">
    <PageHeader title="Itinerary" eyebrow={tour ? `${tour.year} · ${tour.location}` : 'Tour schedule'} className="itinerary-page-header" />
    {loading ? <p className="card">Loading tour itinerary…</p> : null}
    {error ? <p className="card form-error">{error}</p> : null}
    <section className="card tour-itinerary-card">
      {datedGroups.length === 0 ? <p>Itinerary TBC.</p> : <>
        <nav className="itinerary-day-tabs" aria-label="Itinerary days" role="tablist">
          {datedGroups.map((group) => <button
            aria-controls={`itinerary-day-${group.date}`}
            aria-selected={group.date === selectedGroup?.date}
            className={group.date === selectedGroup?.date ? 'is-active' : ''}
            key={group.date}
            onClick={() => setSelectedDate(group.date)}
            role="tab"
            type="button"
          >
            <span>{formatDayName(group.date)}</span>
            <small>{formatDayNumber(group.date)}</small>
          </button>)}
        </nav>
        {selectedGroup ? <section className="itinerary-selected-day" id={`itinerary-day-${selectedGroup.date}`} role="tabpanel">
          <header className="itinerary-selected-day-header">
            <div><p className="eyebrow">Today’s plan</p><h2>{selectedGroup.label}</h2></div>
            <TeamKitChips kits={selectedGroup.kits} teams={activeData.tourTeams} />
          </header>
          {selectedGroup.entries.length > 0
            ? <div className="itinerary-event-list">{selectedGroup.entries.map((entry) => <ScheduleEntry entry={entry} courses={activeData.tourCourses} key={entry.id} />)}</div>
            : <p className="itinerary-empty-day">No activities have been added for this day yet.</p>}
        </section> : null}
      </>}
    </section>
    <footer className="subtle-admin-link"><button type="button" onClick={() => { void logoutPublicAccess().finally(() => window.location.assign('/')); }}>Reset tour access</button><a href="/admin">Admin</a></footer>
  </div>;
}

function ScheduleEntry({ entry, courses }: { entry: TourScheduleEntry; courses: PublicTourInfoResponse['tourCourses'] }) {
  const label = entry.kind === 'golf' ? 'Golf' : manualItineraryKindLabels[entry.kind];
  const time = entry.kind === 'golf'
    ? formatItineraryTime(formatTeeTimeDisplay(entry.timeLabel))
    : entry.timeLabel ? formatItineraryTime(entry.timeLabel) : (entry.kind === 'accommodation' ? 'Stay' : entry.kind === 'activity' ? 'Info' : 'TBC');
  const timeContext = entry.kind === 'golf' ? 'First tee' : entry.kind === 'flight' || entry.kind === 'travel' ? 'Departs' : label;
  const arrival = entry.endTimeLabel
    ? `${entry.kind === 'flight' ? 'Lands' : 'Arrives'} ${formatItineraryTime(entry.endTimeLabel)}`
    : undefined;
  const guide = entry.courseId ? courses.find((course) => course.id === entry.courseId) : undefined;
  return <article className={`itinerary-event itinerary-event-${entry.kind}`}>
    <div className="itinerary-event-time"><span>{time}</span><small>{timeContext}</small></div>
    <div className="itinerary-event-rail"><span><ScheduleKindIcon kind={entry.kind} /></span></div>
    <div className="itinerary-event-card">
      <div>
        <small>{label}{arrival ? ` · ${arrival}` : ''}</small>
        <strong>{entry.activity}{entry.kind !== 'golf' && entry.isPlaceholder && !/tbc/i.test(entry.activity) ? ' · TBC' : ''}</strong>
        {entry.location ? <p>{entry.location}</p> : null}
        {entry.notes ? <p>{entry.notes}</p> : null}
      </div>
      {guide ? <a className="itinerary-event-link" href={courseGuidePath(guide)} aria-label={`Open ${guide.name} course guide`}>›</a> : null}
    </div>
  </article>;
}

function scheduleGroups(schedule: TourScheduleEntry[], kit: TourTeamDayKit[], startDate?: string, endDate?: string) {
  const dates = [...new Set([
    ...tourDateRange(startDate, endDate),
    ...schedule.map((entry) => entry.itemDate ?? 'date-tbc'),
    ...kit.map((item) => item.kitDate),
  ])].sort((a, b) => (a === 'date-tbc' ? 1 : b === 'date-tbc' ? -1 : a.localeCompare(b)));
  return dates.map((date) => {
    const entries = schedule.filter((entry) => (entry.itemDate ?? 'date-tbc') === date);
    return {
      date,
      label: date === 'date-tbc' ? 'Date TBC' : formatLongDate(date),
      entries,
      kits: kit.filter((item) => item.kitDate === date),
    };
  });
}

function tourDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return [];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end && dates.length < 31; cursor = new Date(cursor.valueOf() + 86_400_000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDayName(date: string) {
  if (date === 'date-tbc') return 'TBC';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

function formatDayNumber(date: string) {
  if (date === 'date-tbc') return 'Date';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

function ScheduleKindIcon({ kind }: { kind: TourScheduleEntry['kind'] }) {
  if (kind === 'flight') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 11 18-7-7 18-3-8-8-3Z" /><path d="m11 14 4-4" /></svg>;
  if (kind === 'travel') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 17h14l-1-7H6l-1 7Z" /><path d="m7 10 2-4h6l2 4M7 17v2m10-2v2" /><circle cx="8" cy="14" r="1" /><circle cx="16" cy="14" r="1" /></svg>;
  if (kind === 'accommodation') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 18V9m18 9V12H8v6M3 14h5M5 9h3v5H3v-3a2 2 0 0 1 2-2Z" /><path d="M3 18v2m18-2v2" /></svg>;
  if (kind === 'food') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M17 3v18m0-18c-3 2-3 8 0 9" /></svg>;
  if (kind === 'activity') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v5m0 3h.01" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 21V3m0 1h9l-2 4 2 4H7" /><circle cx="7" cy="21" r="1.5" /></svg>;
}

function TeamKitChips({ kits, teams }: { kits: TourTeamDayKit[]; teams: TourTeam[] }) {
  if (kits.length === 0) return null;
  return <div className="team-kit-chip-list" aria-label="Team shirt colours">{kits.map((kit, index) => {
    const team = teams.find((candidate) => candidate.id === kit.teamId);
    return <span className="team-kit-chip" key={kit.id} style={{ '--team-colour': normalizeTeamColour(team?.colour, index) } as CSSProperties}><i aria-hidden="true" />{team?.name ?? 'Team TBC'} · {kit.colourLabel}</span>;
  })}</div>;
}
