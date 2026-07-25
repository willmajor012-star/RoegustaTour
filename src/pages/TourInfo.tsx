import type { CSSProperties } from 'react';
import { PageHeader } from '../components/PageHeader';
import { formatDate } from '../lib/formatting';
import { formatRoundDisplayName, formatTeeTimeDisplay } from '../lib/display';
import { fetchPublicTourInfo, type PublicTourInfoResponse, type TourTeamDayKit } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { normalizeTeamColour } from '../lib/teamColours';
import type { TourTeam } from '../lib/types';
import { logoutPublicAccess } from '../lib/publicAccess';

const emptyTourInfo: Omit<PublicTourInfoResponse, 'source'> = { rounds: [], handbookSections: [], itineraryItems: [], teamDayKit: [], tourTeams: [], players: [], roundPrizeResults: [] };

export function TourInfo() {
  const { data, loading, error } = usePublicData(fetchPublicTourInfo);
  const activeData = data ?? emptyTourInfo;
  const tour = activeData.tour;

  return <div className="page-stack handbook-page"><PageHeader title="Tour information" eyebrow={tour?.name ?? 'Tour handbook'} />
    {loading && <p className="card">Loading tour handbook…</p>}
    {error && <p className="card form-error">{error}</p>}
    <section className="handbook-hero card"><div><p className="eyebrow">Details</p><h3>{tour?.location ?? 'Location TBC'}</h3><p>{formatDate(tour?.startDate)} — {formatDate(tour?.endDate)}</p>{tour?.description && <p>{tour.description}</p>}{!loading && !error && !tour && <p>Tour details TBC.</p>}</div><span className="brand-logo-roundel info-logo-mark"><img className="brand-logo" src="/brand/roegusta-logo-mark.png" alt="Roegusta Tour mark" /></span></section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Course guide</p><h2>Rounds</h2></div></div>{activeData.rounds.length === 0 ? <p>Round details will appear once added.</p> : <div className="premium-list">{activeData.rounds.map((round, index) => <div className="premium-list-row" key={round.id}><strong>{formatRoundDisplayName(round, index)}</strong><span>{round.courseName ?? 'Course TBC'} · {round.holes ?? 18} holes · {formatTeeTimeDisplay(round.teeTime)}</span><TeamKitChips kits={activeData.teamDayKit.filter((kit) => kit.kitDate === round.roundDate)} teams={activeData.tourTeams} />{activeData.roundPrizeResults.filter((prize) => prize.roundId === round.id).map((prize) => { const winner = activeData.players.find((player) => player.id === prize.winnerPlayerId)?.displayName ?? activeData.tourTeams.find((team) => team.id === prize.winnerTeamId)?.name ?? 'Winner TBC'; const score = prize.winningScoreText ?? [prize.scoreValue, prize.scoreUnit].filter(Boolean).join(' '); return <small key={prize.id}>Secondary prize: {prize.title} — {winner}{score ? `, ${score}` : ''}</small>; }) }</div>)}</div>}</section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Handbook</p><h2>Key notes</h2></div></div>{activeData.handbookSections.length === 0 ? <p>Tour handbook details will appear once added.</p> : <div className="handbook-section-grid">{activeData.handbookSections.map((section) => <article className="handbook-note" key={section.id}><h4>{section.title}</h4>{section.body && <p>{section.body}</p>}</article>)}</div>}</section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Schedule</p><h2>Itinerary</h2></div></div>{activeData.itineraryItems.length === 0 ? <p>Itinerary TBC.</p> : <div className="timeline-list">{activeData.itineraryItems.map((item) => <article className="timeline-item" key={item.id}><span>{item.dayLabel ?? formatDate(item.itemDate)}</span><div><strong>{item.timeLabel ? `${item.timeLabel} · ` : ''}{item.activity}{item.isPlaceholder && !/tbc/i.test(`${item.timeLabel ?? ''} ${item.activity}`) ? ' · TBC' : ''}</strong>{item.location && <p>{item.location}</p>}{item.notes && <p>{item.notes}</p>}<TeamKitChips kits={activeData.teamDayKit.filter((kit) => kit.kitDate === item.itemDate)} teams={activeData.tourTeams} /></div></article>)}</div>}</section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">Rules</p><h2>Notes</h2></div></div><p>One match result is entered by admin. Team score and individual records are derived automatically from completed matches.</p></section>
    <footer className="subtle-admin-link"><button type="button" onClick={() => { void logoutPublicAccess().finally(() => window.location.assign('/')); }}>Reset tour access</button><a href="/admin">Admin</a></footer>
  </div>;
}


function TeamKitChips({ kits, teams }: { kits: TourTeamDayKit[]; teams: TourTeam[] }) {
  if (kits.length === 0) return null;
  return <div className="team-kit-chip-list" aria-label="Team colours">{kits.map((kit, index) => {
    const team = teams.find((candidate) => candidate.id === kit.teamId);
    return <span className="team-kit-chip" key={kit.id} style={{ '--team-colour': normalizeTeamColour(team?.colour, index) } as CSSProperties}><i aria-hidden="true" />{team?.name ?? 'Team TBC'} {kit.colourLabel}</span>;
  })}</div>;
}
