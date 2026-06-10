import { useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { calculatePlayerAdvancedSummaries, type AdvancedStatsData } from '../lib/advancedStats';
import { formatDate, formatPoints, formatShortDate } from '../lib/formatting';
import { formatRoundDisplayName, formatTourDisplayName, isPublicVisibleMatch } from '../lib/display';
import { fetchPublicAdvancedStats, type PublicAdvancedStatsResponse } from '../lib/publicApi';
import type { LeaderboardRow, Tour } from '../lib/types';
import { usePublicData } from '../lib/usePublicData';

const emptyToursData: Omit<PublicAdvancedStatsResponse, 'source'> = { players: [], tours: [], tourTeams: [], tourPlayers: [], tourTeamMembers: [], tourTeamResults: [], rounds: [], matches: [], matchParticipants: [] };

function currentTour(data: Omit<PublicAdvancedStatsResponse, 'source'>) {
  return data.currentTour ?? data.tours.find((tour) => tour.status === 'active') ?? [...data.tours].sort((a, b) => b.year - a.year)[0];
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

function scoreForTour(data: Omit<PublicAdvancedStatsResponse, 'source'>, tour: Tour) {
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
  const sortedTours = [...activeData.tours].sort((a, b) => b.year - a.year || formatTourDisplayName(b).localeCompare(formatTourDisplayName(a)));
  const previousTours = sortedTours.filter((tour) => tour.id !== activeTour?.id);
  const [selectedTourId, setSelectedTourId] = useState<string | undefined>();
  const selectedTour = sortedTours.find((tour) => tour.id === (selectedTourId ?? activeTour?.id)) ?? sortedTours[0];

  return <div className="page-stack tours-page">
    <section className="page-title premium-title"><h2>Tours</h2></section>
    {loading && <p className="card">Loading tours…</p>}
    {error && <p className="card form-error">Tours could not be loaded. Please refresh.</p>}
    {!loading && !error && sortedTours.length === 0 && <p className="card">Tours will appear once published.</p>}

    {activeTour && <section className="tour-archive-section"><div className="stats-section-title"><h3>Current tour</h3></div><TourCard tour={activeTour} data={activeData} selected={selectedTour?.id === activeTour.id} onSelect={setSelectedTourId} /></section>}
    {previousTours.length > 0 && <section className="tour-archive-section"><div className="stats-section-title"><h3>Previous tours</h3></div><div className="tour-card-list">{previousTours.map((tour) => <TourCard key={tour.id} tour={tour} data={activeData} selected={selectedTour?.id === tour.id} onSelect={setSelectedTourId} />)}</div></section>}
    {selectedTour && <TourDetail tour={selectedTour} data={activeData} dataForStats={dataForStats} />}
  </div>;
}

function TourCard({ tour, data, selected, onSelect }: { tour: Tour; data: Omit<PublicAdvancedStatsResponse, 'source'>; selected: boolean; onSelect: (tourId: string) => void }) {
  const scores = scoreForTour(data, tour);
  const rounds = data.rounds.filter((round) => round.tourId === tour.id);
  const results = data.matches.filter((match) => match.tourId === tour.id && match.status === 'complete');
  const winner = scores.find((row) => row.resultStatus === 'winner') ?? [...scores].sort((a, b) => b.points - a.points)[0];
  return <button className={`tour-archive-card card ${selected ? 'selected' : ''}`} onClick={() => onSelect(tour.id)}>
    <span className="eyebrow">{tour.year || 'Tour'}</span>
    <strong>{formatTourDisplayName(tour)}</strong>
    <span>{tour.location ?? 'Location TBC'}</span>
    <span>{formatDate(tour.startDate)} — {formatDate(tour.endDate)}</span>
    <span>{scores.length > 0 ? scores.map((row) => `${row.team.name} ${formatPoints(row.points)}`).join(' · ') : 'Final score TBC'}</span>
    <small>{winner?.points ? `${winner.team.name} leading` : 'Winning team TBC'} · {rounds.length} rounds · {results.length} results</small>
  </button>;
}

function TourDetail({ tour, data, dataForStats }: { tour: Tour; data: Omit<PublicAdvancedStatsResponse, 'source'>; dataForStats: AdvancedStatsData }) {
  const teams = data.tourTeams.filter((team) => team.tourId === tour.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const rounds = data.rounds.filter((round) => round.tourId === tour.id).sort((a, b) => a.roundNumber - b.roundNumber);
  const matches = data.matches.filter((match) => match.tourId === tour.id && isPublicVisibleMatch(match));
  const leaderboard = tourLeaderboard(dataForStats, tour.id);
  const scores = scoreForTour(data, tour);
  const playerById = new Map(data.players.map((player) => [player.id, player]));

  return <section className="tour-detail card">
    <div className="tour-detail-header"><div><p className="eyebrow">Tour detail</p><h3>{formatTourDisplayName(tour)}</h3><p>{tour.location ?? 'Location TBC'} · {formatDate(tour.startDate)} — {formatDate(tour.endDate)}</p></div><div className="tour-detail-score">{scores.length > 0 ? scores.map((row) => <span key={row.team.id}>{row.team.name} <b>{formatPoints(row.points)}</b></span>) : <span>Final score TBC</span>}</div></div>
    <div className="tour-detail-grid">
      <section><h4>Results</h4>{rounds.length === 0 ? <p>No results yet.</p> : rounds.map((round, index) => {
        const roundMatches = matches.filter((match) => match.roundId === round.id);
        return <div className="tour-round-block" key={round.id}><strong>{formatRoundDisplayName(round, index)}</strong><span>{round.courseName ?? 'Course TBC'} · {formatShortDate(round.roundDate)}</span>{roundMatches.length === 0 ? <p>No results yet.</p> : roundMatches.map((match) => <MatchCard key={match.id} match={match} participants={data.matchParticipants.filter((p) => p.matchId === match.id)} players={data.players} teams={teams} />)}</div>;
      })}</section>
      <section><h4>Teams</h4>{teams.length === 0 ? <p>Teams TBC</p> : teams.map((team) => {
        const members = data.tourTeamMembers.filter((member) => member.teamId === team.id).map((member) => playerById.get(member.playerId)).filter(Boolean);
        return <div className="tour-team-sheet" key={team.id}><strong>{team.name}</strong><span>{members.map((player) => player?.displayName).join(', ') || 'Players TBC'}</span></div>;
      })}</section>
      <section><h4>Leaderboard</h4>{leaderboard.length === 0 ? <p>No leaderboard yet.</p> : <LeaderboardTable rows={leaderboard} />}</section>
    </div>
  </section>;
}
