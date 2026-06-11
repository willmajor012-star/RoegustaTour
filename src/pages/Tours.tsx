import { useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { calculatePlayerAdvancedSummaries, type AdvancedStatsData } from '../lib/advancedStats';
import { formatDate, formatMatchFormat, formatPercent, formatPoints, formatShortDate } from '../lib/formatting';
import { formatRoundDisplayName, formatTourDisplayName, isPublicVisibleMatch, normalizeTeeTime } from '../lib/display';
import { getPlayerInitials } from '../lib/people';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import type { LeaderboardRow, Match, Round, Tour, TourTeam } from '../lib/types';
import { usePublicData } from '../lib/usePublicData';

const emptyToursData: Omit<PublicAdvancedStatsResponse, 'source'> = { players: [], tours: [], tourTeams: [], tourPlayers: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };
type TourSection = 'overview' | 'results' | 'teams' | 'leaderboard';

type TourScoreRow = { team: TourTeam; points: number; resultStatus?: 'winner' | 'runner_up' | 'draw' | 'tbd' };

function currentTour(data: Omit<PublicAdvancedStatsResponse, 'source'>) {
  return data.currentTour ?? data.tours.find((tour) => tour.status === 'active') ?? [...data.tours].sort((a, b) => b.year - a.year)[0];
}

function statusLabel(tour: Tour) {
  if (tour.status === 'planned') return 'Upcoming';
  if (tour.status === 'active') return 'Current';
  return 'Completed';
}

function isCompletedTour(tour: Tour) {
  return tour.status === 'complete' || tour.status === 'archived';
}

function tourLeaderboard(data: AdvancedStatsData, tourId: string): LeaderboardRow[] {
  return calculatePlayerAdvancedSummaries(data, tourId).map((summary) => ({
    playerId: summary.player.id,
    playerName: summary.player.displayName,
    matches: summary.currentTourRecord.matches,
    wins: summary.currentTourRecord.wins,
    draws: summary.currentTourRecord.draws,
    losses: summary.currentTourRecord.losses,
    points: summary.currentTourRecord.pointsWon,
    winPercent: summary.currentTourRecord.winPercent,
  })).filter((row) => row.matches > 0).sort((a, b) => b.points - a.points || b.winPercent - a.winPercent || a.playerName.localeCompare(b.playerName, undefined, { sensitivity: 'base' }));
}

function scoreForTour(data: Omit<PublicAdvancedStatsResponse, 'source'>, tour: Tour): TourScoreRow[] {
  const teams = data.tourTeams.filter((team) => team.tourId === tour.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const resultRows = data.tourTeamResults.filter((result) => result.tourId === tour.id);
  const matchScores = new Map(teams.map((team) => [team.id, 0]));
  data.matches.filter((match) => match.tourId === tour.id && match.status === 'complete').forEach((match) => {
    matchScores.set(match.sideATeamId, (matchScores.get(match.sideATeamId) ?? 0) + (match.pointsSideA ?? 0));
    matchScores.set(match.sideBTeamId, (matchScores.get(match.sideBTeamId) ?? 0) + (match.pointsSideB ?? 0));
  });
  return teams.map((team) => {
    const result = resultRows.find((row) => row.teamId === team.id);
    return { team, points: result?.finalPoints ?? matchScores.get(team.id) ?? 0, resultStatus: result?.resultStatus };
  });
}

function winnerForTour(tour: Tour, scores: TourScoreRow[]) {
  const explicitWinner = scores.find((row) => row.resultStatus === 'winner');
  if (explicitWinner) return explicitWinner;
  if (!isCompletedTour(tour)) return undefined;
  const sorted = [...scores].sort((a, b) => b.points - a.points);
  if (sorted.length < 2 || sorted[0].points <= 0 || sorted[0].points === sorted[1].points) return undefined;
  return sorted[0];
}

function scoreLine(scores: TourScoreRow[]) {
  return scores.length > 0 ? scores.map((row) => `${row.team.name} ${formatPoints(row.points)}`).join(' · ') : 'Score TBC';
}

function cardOutcome(tour: Tour, scores: TourScoreRow[]) {
  const winner = winnerForTour(tour, scores);
  if (isCompletedTour(tour)) return winner ? `${winner.team.name} won` : 'Winner TBC';
  const leader = [...scores].sort((a, b) => b.points - a.points)[0];
  return leader && leader.points > 0 ? `${leader.team.name} leading` : 'Score TBC';
}

function roundTeamScore(roundMatches: Match[]) {
  const complete = roundMatches.filter((match) => match.status === 'complete');
  if (complete.length === 0) return undefined;
  return `${formatPoints(complete.reduce((sum, match) => sum + (match.pointsSideA ?? 0), 0))}–${formatPoints(complete.reduce((sum, match) => sum + (match.pointsSideB ?? 0), 0))}`;
}

function LeaderboardCards({ rows }: { rows: LeaderboardRow[] }) {
  return <div className="leaderboard-cards tour-leaderboard-cards">{rows.map((row, index) => <article className="leaderboard-card card" key={row.playerId}><span className="rank">#{index + 1}</span><span className="leaderboard-name">{row.playerName}</span><strong>{formatPoints(row.points)} pts</strong><span>{row.wins}-{row.draws}-{row.losses} · {formatPercent(row.winPercent)}</span></article>)}</div>;
}

export function Tours() {
  const { data, loading, error } = usePublicData(fetchPublicAdvancedStats);
  const activeData = data ?? emptyToursData;
  const dataForStats: AdvancedStatsData = useMemo(() => ({
    players: activeData.players,
    tours: activeData.tours,
    tourTeams: activeData.tourTeams,
    tourPlayers: activeData.tourPlayers ?? [],
    tourTeamMembers: activeData.tourTeamMembers,
    tourTeamResults: activeData.tourTeamResults,
    rounds: activeData.rounds,
    matches: activeData.matches,
    matchParticipants: activeData.matchParticipants,
    playerMatchResults: activeData.playerMatchResults ?? [],
  }), [activeData]);
  const activeTour = currentTour(activeData);
  const sortedTours = [...activeData.tours].sort((a, b) => {
    if (a.id === activeTour?.id) return -1;
    if (b.id === activeTour?.id) return 1;
    return b.year - a.year || formatTourDisplayName(b).localeCompare(formatTourDisplayName(a));
  });
  const previousTours = sortedTours.filter((tour) => tour.id !== activeTour?.id);
  const [selectedTourId, setSelectedTourId] = useState<string | undefined>();
  const selectedTour = sortedTours.find((tour) => tour.id === selectedTourId);

  if (selectedTour) return <TourDetail tour={selectedTour} data={activeData} dataForStats={dataForStats} onBack={() => setSelectedTourId(undefined)} />;

  return <div className="page-stack tours-page tour-archive-landing">
    <section className="page-title premium-title"><h2>Tours</h2></section>
    {loading && <p className="card">Loading tours…</p>}
    {error && <p className="card form-error">Tours could not be loaded. Please refresh.</p>}
    {!loading && !error && sortedTours.length === 0 && <p className="card">Tours will appear once published.</p>}

    {activeTour && <section className="tour-archive-section"><div className="stats-section-title"><h3>Current tour</h3></div><TourCard tour={activeTour} data={activeData} onSelect={setSelectedTourId} /></section>}
    {previousTours.length > 0 && <section className="tour-archive-section"><div className="stats-section-title"><h3>Previous tours</h3></div><div className="tour-card-list">{previousTours.map((tour) => <TourCard key={tour.id} tour={tour} data={activeData} onSelect={setSelectedTourId} />)}</div></section>}
  </div>;
}

function TourCard({ tour, data, onSelect }: { tour: Tour; data: Omit<PublicAdvancedStatsResponse, 'source'>; onSelect: (tourId: string) => void }) {
  const scores = scoreForTour(data, tour);
  return <button className="tour-archive-card tour-year-card" onClick={() => onSelect(tour.id)}>
    <span className="tour-status-badge">{statusLabel(tour)}</span>
    <strong>{formatTourDisplayName(tour)}</strong>
    <span>{tour.location ?? 'Location TBC'}</span>
    <span>{formatDate(tour.startDate)} — {formatDate(tour.endDate)}</span>
    <small>{cardOutcome(tour, scores)} · {scoreLine(scores)}</small>
  </button>;
}

function TourDetail({ tour, data, dataForStats, onBack }: { tour: Tour; data: Omit<PublicAdvancedStatsResponse, 'source'>; dataForStats: AdvancedStatsData; onBack: () => void }) {
  const [section, setSection] = useState<TourSection>('overview');
  const teams = data.tourTeams.filter((team) => team.tourId === tour.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const rounds = data.rounds.filter((round) => round.tourId === tour.id).sort((a, b) => a.roundNumber - b.roundNumber);
  const matches = data.matches.filter((match) => match.tourId === tour.id && isPublicVisibleMatch(match));
  const leaderboard = tourLeaderboard(dataForStats, tour.id);
  const scores = scoreForTour(data, tour);
  const winner = winnerForTour(tour, scores);

  return <div className="page-stack tours-page selected-tour-page">
    <button className="back-to-tours" onClick={onBack}>‹ Back to tours</button>
    <section className="selected-tour-hero card">
      <div><span className="tour-status-badge">{statusLabel(tour)}</span><h2>{formatTourDisplayName(tour)}</h2><p>{tour.location ?? 'Location TBC'} · {formatDate(tour.startDate)} — {formatDate(tour.endDate)}</p>{winner && <strong>{winner.team.name} won</strong>}</div>
      <div className="tour-detail-score">{scores.length > 0 ? scores.map((row) => <span key={row.team.id}>{row.team.name} <b>{formatPoints(row.points)}</b></span>) : <span>Score TBC</span>}</div>
    </section>
    <div className="segmented tour-detail-switch" role="tablist" aria-label="Tour detail sections">{[
      ['overview', 'Overview'], ['results', 'Results'], ['teams', 'Teams'], ['leaderboard', 'Leaderboard'],
    ].map(([value, label]) => <button key={value} className={section === value ? 'active' : ''} onClick={() => setSection(value as TourSection)}>{label}</button>)}</div>
    {section === 'overview' && <TourOverview tour={tour} data={data} scores={scores} rounds={rounds} matches={matches} winner={winner} />}
    {section === 'results' && <TourResults rounds={rounds} matches={matches} data={data} teams={teams} />}
    {section === 'teams' && <TourTeams teams={teams} data={data} />}
    {section === 'leaderboard' && <TourLeaderboard rows={leaderboard} hasMatches={matches.length > 0} />}
  </div>;
}

function TourOverview({ tour, data, scores, rounds, matches, winner }: { tour: Tour; data: Omit<PublicAdvancedStatsResponse, 'source'>; scores: TourScoreRow[]; rounds: Round[]; matches: Match[]; winner?: TourScoreRow }) {
  const teamIds = new Set(data.tourTeams.filter((team) => team.tourId === tour.id).map((team) => team.id));
  const playerIds = new Set(data.tourTeamMembers.filter((member) => teamIds.has(member.teamId)).map((member) => member.playerId));
  const courses = new Set(rounds.map((round) => round.courseName).filter(Boolean));
  const completeMatches = matches.filter((match) => match.status === 'complete').length;
  return <section className="tour-detail-section card"><h3>Overview</h3><div className="tour-overview-grid"><Stat label="Team score" value={scoreLine(scores)} /><Stat label="Winner" value={winner ? `${winner.team.name} won` : isCompletedTour(tour) ? 'Winner TBC' : 'TBC'} /><Stat label="Players" value={playerIds.size || 'TBC'} /><Stat label="Rounds" value={rounds.length || 'TBC'} /><Stat label="Courses" value={courses.size || 'TBC'} /><Stat label="Results" value={matches.length > 0 ? `${completeMatches}/${matches.length}` : 'TBC'} /></div></section>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <article><span>{label}</span><strong>{value}</strong></article>;
}

function TourResults({ rounds, matches, data, teams }: { rounds: Round[]; matches: Match[]; data: Omit<PublicAdvancedStatsResponse, 'source'>; teams: TourTeam[] }) {
  if (matches.length === 0) return <section className="tour-detail-section card"><h3>Results</h3><p>Matches will appear once pairings/results are available.</p></section>;
  return <section className="tour-detail-section card"><h3>Results</h3>{rounds.length === 0 ? <p>No results yet.</p> : rounds.map((round, index) => {
    const roundMatches = matches.filter((match) => match.roundId === round.id);
    const score = roundTeamScore(roundMatches);
    const roundFormats = [...new Set(roundMatches.map((match) => formatMatchFormat(match.format)))].join(' / ');
    return <div className="tour-round-block" key={round.id}><div className="tour-round-header"><div><strong>{formatRoundDisplayName(round, index)}</strong><span>{round.courseName ?? 'Course TBC'} · {formatShortDate(round.roundDate)}{roundFormats ? ` · ${roundFormats}` : ''}{normalizeTeeTime(round.teeTime) ? ` · ${normalizeTeeTime(round.teeTime)}` : ''}</span></div>{score && <b>{score}</b>}</div>{roundMatches.length === 0 ? <p>No results yet.</p> : roundMatches.map((match) => <MatchCard key={match.id} match={match} participants={data.matchParticipants.filter((p) => p.matchId === match.id)} players={data.players} teams={teams} />)}</div>;
  })}</section>;
}

function TourTeams({ teams, data }: { teams: TourTeam[]; data: Omit<PublicAdvancedStatsResponse, 'source'> }) {
  const playerById = new Map(data.players.map((player) => [player.id, player]));
  return <section className="tour-detail-section"><h3>Teams</h3>{teams.length === 0 ? <p className="card">Teams TBC</p> : <div className="team-card-grid">{teams.map((team) => {
    const captain = team.captainPlayerId ? playerById.get(team.captainPlayerId) : undefined;
    const members = data.tourTeamMembers.filter((member) => member.teamId === team.id).map((member) => playerById.get(member.playerId)).filter(Boolean);
    return <article className="team-display-card card" key={team.id}><div className="team-card-topline"><span className="team-dot" /><p className="eyebrow">Team</p></div><h3>{team.name}</h3>{captain && <div className="captain-strip"><span>Captain</span><strong>{captain.displayName}</strong></div>}<div className="team-member-list">{members.length === 0 ? <p>Players TBC</p> : members.map((player) => player && <div className="team-member-row" key={player.id}><span className="avatar small">{getPlayerInitials(player)}</span><div><strong>{player.displayName}</strong>{player.nickname && <span>{player.nickname}</span>}</div></div>)}</div></article>;
  })}</div>}</section>;
}

function TourLeaderboard({ rows, hasMatches }: { rows: LeaderboardRow[]; hasMatches: boolean }) {
  if (!hasMatches || rows.length === 0) return <section className="tour-detail-section"><h3>Leaderboard</h3><p className="card">Leaderboard will appear once results are available.</p></section>;
  return <section className="tour-detail-section"><h3>Leaderboard</h3><LeaderboardCards rows={rows} /><LeaderboardTable rows={rows} /></section>;
}
