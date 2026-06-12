import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MatchCard } from '../components/MatchCard';
import { fetchPublicMatches, type PublicMatchesResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { formatDate, formatMatchFormat, formatPoints, formatShortDate } from '../lib/formatting';
import { formatRoundDisplayName, isPublicVisibleMatch, normalizeTeeTime } from '../lib/display';
import { calculateTeamScoreByTour } from '../lib/scoring';
import { getPlayerInitials } from '../lib/people';
import { normalizeTeamColour } from '../lib/teamColours';
import type { Match, MatchParticipant, Player, Round, TourTeam } from '../lib/types';

const emptyMatchesData: Omit<PublicMatchesResponse, 'source'> = { tour: undefined, rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [], tourTeamMembers: [] };
type GolfSection = 'today' | 'tee-times' | 'results' | 'teams' | 'info';
const golfSections: Array<{ value: GolfSection; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'tee-times', label: 'Tee Times' },
  { value: 'results', label: 'Results' },
  { value: 'teams', label: 'Teams' },
  { value: 'info', label: 'Info' },
];

function roundSession(round?: Round) {
  const match = round?.notes?.match(/^\[Session: (AM|PM|TBC)\]/);
  return match?.[1];
}

function tourStatusLabel(status?: string, matches: Match[] = []) {
  if (status === 'complete' || (matches.length > 0 && matches.every((match) => match.status === 'complete'))) return 'Complete';
  if (status === 'active' || matches.some((match) => match.status === 'active')) return 'Live';
  return 'Upcoming';
}

function pairingText(match: Match, participants: MatchParticipant[], players: Player[], teams: TourTeam[]) {
  const nameFor = (playerId: string) => players.find((player) => player.id === playerId)?.displayName;
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId)?.name;
  const sidePlayers = (side: 'A' | 'B') => participants.filter((participant) => participant.side === side).map((participant) => nameFor(participant.playerId)).filter(Boolean).join(' / ');
  const sideA = sidePlayers('A') || match.sideALabel || teamFor(match.sideATeamId) || 'Side A TBC';
  const sideB = sidePlayers('B') || match.sideBLabel || teamFor(match.sideBTeamId) || 'Side B TBC';
  return `${sideA} v ${sideB}`;
}

function roundTeamScore(matches: Match[]) {
  const complete = matches.filter((match) => match.status === 'complete');
  if (complete.length === 0) return undefined;
  const sideA = complete.reduce((sum, match) => sum + (match.pointsSideA ?? 0), 0);
  const sideB = complete.reduce((sum, match) => sum + (match.pointsSideB ?? 0), 0);
  return `${formatPoints(sideA)}–${formatPoints(sideB)}`;
}

export function Matches() {
  const [roundId, setRoundId] = useState('');
  const [section, setSection] = useState<GolfSection>('today');
  const { data, loading, error } = usePublicData(fetchPublicMatches, { onErrorMessage: 'Golf schedule could not be loaded. Please refresh.' });
  const activeData = data ?? emptyMatchesData;
  const publicMatches = activeData.matches.filter(isPublicVisibleMatch);
  const selectedRound = activeData.rounds.find((round) => round.id === roundId) ?? activeData.rounds[0];
  const selectedRoundMatches = selectedRound ? publicMatches.filter((match) => match.roundId === selectedRound.id) : [];
  const selectedCompleteMatches = selectedRoundMatches.filter((match) => match.status === 'complete');
  const inProgressCount = selectedRoundMatches.filter((match) => match.status === 'active').length;
  const remainingCount = selectedRoundMatches.filter((match) => match.status !== 'complete').length;
  const scoreRows = activeData.tour ? calculateTeamScoreByTour(activeData.tour.id, activeData.tourTeams, activeData.rounds, publicMatches) : [];
  const teeSheetMatches = [...selectedRoundMatches].sort((a, b) => (normalizeTeeTime(a.teeTime) ?? '99:99').localeCompare(normalizeTeeTime(b.teeTime) ?? '99:99') || a.matchNumber - b.matchNumber);
  const hasTeeTimes = teeSheetMatches.some((match) => normalizeTeeTime(match.teeTime));
  const roundFormats = [...new Set(selectedRoundMatches.map((match) => formatMatchFormat(match.format)))].join(' / ');
  const roundSessionLabel = roundSession(selectedRound);

  useEffect(() => {
    if (!roundId && activeData.rounds[0]) setRoundId(activeData.rounds[0].id);
    if (roundId && activeData.rounds.length > 0 && !activeData.rounds.some((round) => round.id === roundId)) setRoundId(activeData.rounds[0].id);
  }, [activeData.rounds, roundId]);

  const tourScoreSummary = useMemo(() => scoreRows.map((row) => `${row.teamName} ${formatPoints(row.points)}`).join(' · '), [scoreRows]);

  return <div className="page-stack results-page golf-page"><section className="page-title premium-title"><h2>Golf</h2></section>
    {loading && <p className="card">Loading golf schedule...</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && <>
      <section className="selected-tour-hero card golf-hero-card">
        <div><span className="tour-status-badge">{tourStatusLabel(activeData.tour?.status, publicMatches)}</span><h2>{activeData.tour?.name ?? 'Current tour'}</h2><p>{activeData.tour?.location ?? 'Location TBC'} · {formatDate(activeData.tour?.startDate)} — {formatDate(activeData.tour?.endDate)}</p>{selectedRound && <strong>Current round: {formatRoundDisplayName(selectedRound)}</strong>}</div>
        <div className="tour-detail-score">{scoreRows.length > 0 ? scoreRows.map((row, index) => <span key={row.teamId} style={{ '--team-colour': normalizeTeamColour(row.colour, index) } as CSSProperties}>{row.teamName} <b>{formatPoints(row.points)}</b></span>) : <span>Score TBC</span>}</div>
      </section>
      <div className="segmented tour-detail-switch golf-section-switch" role="tablist" aria-label="Golf sections">{golfSections.map((item) => <button key={item.value} className={section === item.value ? 'active' : ''} onClick={() => setSection(item.value)}>{item.label}</button>)}</div>
      {activeData.rounds.length === 0 ? <p className="card">Pairings and tee times will appear once published.</p> : <label className="filters card golf-round-selector"><span>Round</span><select value={selectedRound?.id ?? ''} onChange={(event) => setRoundId(event.target.value)}>{activeData.rounds.map((round, index) => <option key={round.id} value={round.id}>{formatRoundDisplayName(round, index)}</option>)}</select></label>}
      {section === 'today' && <GolfToday selectedRound={selectedRound} selectedRoundMatches={selectedRoundMatches} selectedCompleteMatches={selectedCompleteMatches} inProgressCount={inProgressCount} remainingCount={remainingCount} teeSheetMatches={teeSheetMatches} hasTeeTimes={hasTeeTimes} scoreSummary={tourScoreSummary} players={activeData.players} teams={activeData.tourTeams} participants={activeData.matchParticipants} />}
      {section === 'tee-times' && selectedRound && <GolfTeeTimes selectedRound={selectedRound} matches={teeSheetMatches} hasTeeTimes={hasTeeTimes} players={activeData.players} teams={activeData.tourTeams} participants={activeData.matchParticipants} />}
      {section === 'results' && <GolfResults rounds={activeData.rounds} selectedRound={selectedRound} matches={publicMatches} data={activeData} teams={activeData.tourTeams} />}
      {section === 'teams' && <GolfTeams teams={activeData.tourTeams} data={activeData} />}
      {section === 'info' && selectedRound && <GolfRoundInfo selectedRound={selectedRound} roundFormats={roundFormats} roundSessionLabel={roundSessionLabel} />}
    </>}
  </div>;
}

function GolfToday({ selectedRound, selectedRoundMatches, selectedCompleteMatches, inProgressCount, remainingCount, teeSheetMatches, hasTeeTimes, scoreSummary, players, teams, participants }: { selectedRound?: Round; selectedRoundMatches: Match[]; selectedCompleteMatches: Match[]; inProgressCount: number; remainingCount: number; teeSheetMatches: Match[]; hasTeeTimes: boolean; scoreSummary: string; players: Player[]; teams: TourTeam[]; participants: MatchParticipant[] }) {
  return <section className="card golf-status-card"><p className="eyebrow">Today</p><h3>{selectedRound ? formatRoundDisplayName(selectedRound) : 'Round TBC'}</h3><div className="tour-overview-grid"><article><span>Matches complete</span><strong>{selectedCompleteMatches.length}/{selectedRoundMatches.length}</strong></article><article><span>In progress</span><strong>{inProgressCount}</strong></article><article><span>Remaining</span><strong>{remainingCount}</strong></article><article><span>Team score</span><strong>{scoreSummary || 'TBC'}</strong></article></div><div className="premium-inset"><p className="eyebrow">Next tee times</p>{selectedRoundMatches.length === 0 ? <p>Pairings and tee times will appear once published.</p> : !hasTeeTimes ? <p>Tee times will appear once published.</p> : <div className="tee-sheet-list">{teeSheetMatches.slice(0, 3).map((match) => <TeeSheetRow key={match.id} match={match} participants={participants.filter((participant) => participant.matchId === match.id)} players={players} teams={teams} />)}</div>}</div></section>;
}

function GolfTeeTimes({ selectedRound, matches, hasTeeTimes, players, teams, participants }: { selectedRound: Round; matches: Match[]; hasTeeTimes: boolean; players: Player[]; teams: TourTeam[]; participants: MatchParticipant[] }) {
  return <section className="card tee-sheet-card"><div className="section-heading"><div><p className="eyebrow">Tee times and pairings</p><h3>{formatRoundDisplayName(selectedRound)}</h3></div></div>{matches.length === 0 ? <p>Pairings and tee times will appear once published.</p> : <><div className="tee-sheet-list">{!hasTeeTimes ? <p>Tee times will appear once published.</p> : matches.map((match) => <TeeSheetRow key={match.id} match={match} participants={participants.filter((participant) => participant.matchId === match.id)} players={players} teams={teams} />)}</div><div className="round-match-list">{matches.map((match) => <MatchCard key={match.id} match={match} participants={participants.filter((p) => p.matchId === match.id)} players={players} teams={teams} />)}</div></>}</section>;
}

function GolfResults({ rounds, selectedRound, matches, data, teams }: { rounds: Round[]; selectedRound?: Round; matches: Match[]; data: Omit<PublicMatchesResponse, 'source'>; teams: TourTeam[] }) {
  const visibleRounds = selectedRound ? [selectedRound] : rounds;
  if (matches.length === 0) return <section className="tour-detail-section card"><h3>Results</h3><p>Pairings and tee times will appear once published.</p></section>;
  return <section className="tour-detail-section card"><h3>Results</h3>{visibleRounds.map((round, index) => {
    const roundMatches = matches.filter((match) => match.roundId === round.id);
    const score = roundTeamScore(roundMatches);
    const roundFormats = [...new Set(roundMatches.map((match) => formatMatchFormat(match.format)))].join(' / ');
    return <div className="tour-round-block" key={round.id}><div className="tour-round-header"><div><strong>{formatRoundDisplayName(round, index)}</strong><span>{round.courseName ?? 'Course TBC'} · {formatShortDate(round.roundDate)}{roundFormats ? ` · ${roundFormats}` : ''}{normalizeTeeTime(round.teeTime) ? ` · ${normalizeTeeTime(round.teeTime)}` : ''}</span></div>{score && <b>{score}</b>}</div>{roundMatches.length === 0 ? <p>No results yet.</p> : roundMatches.map((match) => <MatchCard key={match.id} match={match} participants={data.matchParticipants.filter((p) => p.matchId === match.id)} players={data.players} teams={teams} />)}</div>;
  })}</section>;
}

function GolfTeams({ teams, data }: { teams: TourTeam[]; data: Omit<PublicMatchesResponse, 'source'> }) {
  const playerById = new Map(data.players.map((player) => [player.id, player]));
  return <section className="tour-detail-section"><h3>Teams</h3>{teams.length === 0 ? <p className="card">Teams TBC</p> : <div className="team-card-grid">{teams.map((team, index) => {
    const captain = team.captainPlayerId ? playerById.get(team.captainPlayerId) : undefined;
    const members = data.tourTeamMembers.filter((member) => member.teamId === team.id).map((member) => playerById.get(member.playerId)).filter(Boolean);
    return <article className="team-display-card card" key={team.id} style={{ '--team-colour': normalizeTeamColour(team.colour, index) } as CSSProperties}><div className="team-card-topline"><span className="team-dot" /><p className="eyebrow">Team</p></div><h3>{team.name}</h3>{captain && <div className="captain-strip"><span>Captain</span><strong>{captain.displayName}</strong></div>}<div className="team-member-list">{members.length === 0 ? <p>Players TBC</p> : members.map((player) => player && <div className="team-member-row" key={player.id}><span className="avatar small">{getPlayerInitials(player)}</span><div><strong>{player.displayName}</strong>{player.nickname && <span>{player.nickname}</span>}</div></div>)}</div></article>;
  })}</div>}</section>;
}

function GolfRoundInfo({ selectedRound, roundFormats, roundSessionLabel }: { selectedRound: Round; roundFormats: string; roundSessionLabel?: string }) {
  return <section className="card round-info-card"><p className="eyebrow">Round information</p><h3>{formatRoundDisplayName(selectedRound)}</h3><div className="golf-info-grid"><span>Date <strong>{formatShortDate(selectedRound.roundDate)}</strong></span><span>Course <strong>{selectedRound.courseName ?? 'Course TBC'}</strong></span><span>Format <strong>{selectedRound.formatLabel ?? (roundFormats || 'Format TBC')}</strong></span><span>Session <strong>{roundSessionLabel ?? 'TBC'}</strong></span><span>Tee time <strong>{normalizeTeeTime(selectedRound.teeTime) ?? 'TBC'}</strong></span><span>Status <strong>{selectedRound.status}</strong></span></div></section>;
}

function TeeSheetRow({ match, participants, players, teams }: { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] }) {
  return <div className="tee-sheet-row"><strong>{normalizeTeeTime(match.teeTime) ?? 'TBC'}</strong><span>Match {match.matchNumber}</span><p>{pairingText(match, participants, players, teams)}</p></div>;
}
