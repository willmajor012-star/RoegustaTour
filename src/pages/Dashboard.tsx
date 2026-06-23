import { useEffect, useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { Scoreboard } from '../components/Scoreboard';
import { formatPoints, formatShortDate } from '../lib/formatting';
import { fetchPublicMatches, fetchPublicScore, fetchPublicSummary, type PublicMatchesResponse, type PublicScoreResponse, type PublicSummaryResponse } from '../lib/publicApi';
import type { Match, Round, TeamScoreRow, TourTeam } from '../lib/types';
import { formatRoundDisplayName, formatTourDisplayName, getDateOnlyScheduledDate, getScheduledDate, getScheduleSortTime, isPublicVisibleMatch, normalizeTeeTime } from '../lib/display';
import { usePublicData } from '../lib/usePublicData';
import { normalizeTeamColour } from '../lib/teamColours';
import { awardedPoints, pointsRequiredToWinOutright, totalAvailablePoints } from '../lib/matchplay';

type DashboardData = {
  summary: Omit<PublicSummaryResponse, 'source'>;
  score: Omit<PublicScoreResponse, 'source'>;
  matches: Omit<PublicMatchesResponse, 'source'>;
  source: 'supabase';
};

const emptyDashboardData: DashboardData = {
  source: 'supabase',
  summary: { rounds: [], recentResults: [], openMarkets: [] },
  score: { teams: [], rounds: [], matches: [], scores: [] },
  matches: { rounds: [], matches: [], matchParticipants: [], players: [], tourPlayers: [], tourTeams: [], tourTeamMembers: [] },
};

async function fetchDashboardData(): Promise<DashboardData> {
  const [summary, score, matches] = await Promise.all([fetchPublicSummary(), fetchPublicScore(), fetchPublicMatches()]);
  return { summary, score, matches, source: 'supabase' };
}

function countdownParts(startDate?: string, endDate?: string, status?: string) {
  if (!startDate) return { state: 'Tour date TBC' };
  const now = new Date();
  const start = getDateOnlyScheduledDate(startDate);
  const end = getDateOnlyScheduledDate(endDate, '23:59:59');
  if (!start) return { state: 'Tour date TBC' };
  if (end && now > end && (status === 'complete' || status === 'archived')) return { state: 'Tour complete' };
  if (now >= start && (!end || now <= end)) return { state: 'Tour underway' };
  const totalSeconds = Math.max(0, Math.floor((start.getTime() - now.getTime()) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}


function latestCompletedRound(rounds: Round[], matches: Match[]) {
  return rounds
    .map((round) => {
      const roundMatches = matches.filter((match) => match.roundId === round.id && match.status !== 'void');
      const complete = roundMatches.length > 0 && roundMatches.every((match) => match.status === 'complete');
      return complete ? { round, matches: roundMatches } : undefined;
    })
    .filter((item): item is { round: Round; matches: Match[] } => Boolean(item))
    .sort((a, b) => (getScheduledDate(b.round.roundDate, b.round.teeTime)?.getTime() ?? 0) - (getScheduledDate(a.round.roundDate, a.round.teeTime)?.getTime() ?? 0) || b.round.roundNumber - a.round.roundNumber)[0];
}

function roundScore(matches: Match[]) {
  const sideA = matches.reduce((sum, match) => sum + (match.pointsSideA ?? 0), 0);
  const sideB = matches.reduce((sum, match) => sum + (match.pointsSideB ?? 0), 0);
  return `${formatPoints(sideA)}–${formatPoints(sideB)}`;
}

function teamScoreRows(scores: TeamScoreRow[], teams: TourTeam[]): TeamScoreRow[] {
  const rows = scores.length > 0 ? scores : teams.slice(0, 2).map((team, index) => ({ teamId: team.id, teamName: team.name, colour: normalizeTeamColour(team.colour, index), points: 0, pointsByRound: {} }));
  return [
    rows[0] ?? { teamId: 'score-left-unavailable', teamName: 'Team unavailable', colour: '#062B22', points: 0, pointsByRound: {} },
    rows[1] ?? { teamId: 'score-right-unavailable', teamName: 'Team unavailable', colour: '#7A1E1E', points: 0, pointsByRound: {} },
  ];
}

export function Dashboard() {
  const { data, loading, error } = usePublicData(fetchDashboardData);
  const [, setTick] = useState(0);
  const activeData = data ?? emptyDashboardData;
  const tour = activeData.summary.tour ?? activeData.score.tour ?? activeData.matches.tour;
  const rounds = activeData.summary.rounds.length > 0 ? activeData.summary.rounds : activeData.score.rounds.length > 0 ? activeData.score.rounds : activeData.matches.rounds;
  const roundById = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds]);
  const visibleMatches = activeData.matches.matches.filter(isPublicVisibleMatch);
  const teamRows = teamScoreRows(activeData.score.scores, activeData.score.teams.length > 0 ? activeData.score.teams : activeData.matches.tourTeams);
  const totalPointsAvailable = totalAvailablePoints(visibleMatches);
  const remainingPoints = totalPointsAvailable - awardedPoints(visibleMatches);
  const pointsToWinOutright = pointsRequiredToWinOutright(totalPointsAvailable);
  const scheduled = visibleMatches
    .filter((match) => match.status !== 'complete')
    .map((match) => ({ match, round: roundById.get(match.roundId) }))
    .sort((a, b) => getScheduleSortTime(a.round?.roundDate, a.match.teeTime ?? a.round?.teeTime) - getScheduleSortTime(b.round?.roundDate, b.match.teeTime ?? b.round?.teeTime) || a.match.matchNumber - b.match.matchNumber);
  const nextTee = scheduled[0];
  const latestRound = latestCompletedRound(rounds, visibleMatches);
  const latestResult = latestRound ? undefined : ([...visibleMatches].filter((match) => match.status === 'complete').sort((a, b) => (getScheduledDate(roundById.get(b.roundId)?.roundDate, b.teeTime)?.getTime() ?? 0) - (getScheduledDate(roundById.get(a.roundId)?.roundDate, a.teeTime)?.getTime() ?? 0) || b.matchNumber - a.matchNumber)[0] ?? activeData.summary.recentResults[0]);
  const countdown = countdownParts(tour?.startDate, tour?.endDate, tour?.status);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return <div className="page-stack dashboard-page">
    {loading && <p className="card">Loading…</p>}
    {error && <p className="card form-error">Data could not be loaded. Please refresh.</p>}

    <section className="countdown-card card">
      <p className="eyebrow">Tour countdown</p>
      {'state' in countdown ? <strong>{countdown.state}</strong> : <div className="countdown-grid">
        <span><b>{countdown.days}</b><small>days</small></span>
        <span><b>{countdown.hours}</b><small>hours</small></span>
        <span><b>{countdown.minutes}</b><small>minutes</small></span>
        <span><b>{countdown.seconds}</b><small>seconds</small></span>
      </div>}
      <span>{formatTourDisplayName(tour)}</span>
    </section>

    <section className="score-feature card">
      <div className="section-heading"><div><p className="eyebrow">Team score</p><h2>Team score</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
      <Scoreboard scores={teamRows} href="/matches" hideCentreScore />
    </section>

    <section className="overview-highlight-grid">
      <a className="card tappable-card victory-card" href="/matches">
        <p className="eyebrow">Points to victory</p>
        <h3>{pointsToWinOutright === undefined ? 'Points target TBC' : `${formatPoints(pointsToWinOutright)} to win`}</h3>
        {pointsToWinOutright !== undefined && <p>{formatPoints(totalPointsAvailable)} available · {formatPoints(remainingPoints)} remaining</p>}
        <span className="card-chevron" aria-hidden="true">›</span>
      </a>
      <a className="next-tee-card card tappable-card" href="/matches">
        <p className="eyebrow">Next tee</p>
        <h3>{nextTee?.round ? formatRoundDisplayName(nextTee.round) : 'Next tee TBC'}</h3>
        {nextTee?.round ? <p>{nextTee.round.courseName ?? 'Course TBC'} · {formatShortDate(nextTee.round.roundDate)}</p> : <p>Next tee TBC</p>}
        <div className="tee-time-lockup"><strong>{normalizeTeeTime(nextTee?.match.teeTime) ?? normalizeTeeTime(nextTee?.round?.teeTime) ?? 'TBC'}</strong><span className="card-chevron" aria-hidden="true">›</span></div>
      </a>
    </section>

    <a className="card tappable-card latest-result-card" href="/matches">
      <div className="section-heading"><div><p className="eyebrow">Latest result</p><h2>Latest result</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
      {latestRound ? <div className="latest-round-results"><p><strong>{formatRoundDisplayName(latestRound.round)}</strong>{latestRound.round.roundDate ? ` · ${formatShortDate(latestRound.round.roundDate)}` : ''} · {roundScore(latestRound.matches)}</p>{latestRound.matches.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />)}</div> : !latestResult ? <p>No results yet</p> : <MatchCard match={latestResult} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === latestResult.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />}
    </a>

  </div>;
}
