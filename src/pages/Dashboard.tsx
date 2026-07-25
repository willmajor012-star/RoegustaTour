import { useEffect, useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { CourseRail } from '../components/CourseRail';
import { Scoreboard } from '../components/Scoreboard';
import { formatMatchFormat, formatPoints, formatShortDate } from '../lib/formatting';
import { fetchPublicMatches, fetchPublicScore, fetchPublicSummary, type PublicMatchesResponse, type PublicScoreResponse, type PublicSummaryResponse } from '../lib/publicApi';
import type { Match, Round, TeamScoreRow, TourTeam } from '../lib/types';
import { formatRoundDisplayName, formatTourDisplayName, getDateOnlyScheduledDate, getScheduledDate, getScheduleSortTime, isPublicVisibleMatch, normalizeTeeTime } from '../lib/display';
import { usePublicData } from '../lib/usePublicData';
import { TEAM_COLOUR_FALLBACKS, normalizeTeamColour } from '../lib/teamColours';
import { awardedPoints, pointsRequiredToWinOutright, totalAvailablePoints } from '../lib/matchplay';
import { courseGuidesForTour } from '../data/courseGuides';

type DashboardData = {
  summary: Omit<PublicSummaryResponse, 'source'>;
  score: Omit<PublicScoreResponse, 'source'>;
  matches: Omit<PublicMatchesResponse, 'source'>;
  source: 'supabase';
};

const emptyDashboardData: DashboardData = {
  source: 'supabase',
  summary: { rounds: [], recentResults: [], openMarkets: [], tourCourses: [] },
  score: { teams: [], rounds: [], matches: [], scores: [] },
  matches: { rounds: [], matches: [], matchParticipants: [], players: [], tourPlayers: [], tourTeams: [], tourTeamMembers: [], roundPrizeResults: [], tourCourses: [] },
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
    rows[0] ?? { teamId: 'score-left-unavailable', teamName: 'Team TBC', colour: TEAM_COLOUR_FALLBACKS[0], points: 0, pointsByRound: {} },
    rows[1] ?? { teamId: 'score-right-unavailable', teamName: 'Team TBC', colour: TEAM_COLOUR_FALLBACKS[1], points: 0, pointsByRound: {} },
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
  const sortedRounds = [...rounds].sort((a, b) => getScheduleSortTime(a.roundDate, a.teeTime) - getScheduleSortTime(b.roundDate, b.teeTime) || a.roundNumber - b.roundNumber);
  const nextRound = nextTee?.round ?? sortedRounds.find((round) => round.status === 'active') ?? sortedRounds.find((round) => getScheduleSortTime(round.roundDate, round.teeTime) >= Date.now()) ?? sortedRounds[0];
  const latestRound = latestCompletedRound(rounds, visibleMatches);
  const latestResult = latestRound ? undefined : ([...visibleMatches].filter((match) => match.status === 'complete').sort((a, b) => (getScheduledDate(roundById.get(b.roundId)?.roundDate, b.teeTime)?.getTime() ?? 0) - (getScheduledDate(roundById.get(a.roundId)?.roundDate, a.teeTime)?.getTime() ?? 0) || b.matchNumber - a.matchNumber)[0] ?? activeData.summary.recentResults[0]);
  const countdown = countdownParts(tour?.startDate, tour?.endDate, tour?.status);
  const tourStart = getDateOnlyScheduledDate(tour?.startDate);
  const tourEnd = getDateOnlyScheduledDate(tour?.endDate, '23:59:59');
  const tourComplete = tour?.status === 'complete' || tour?.status === 'archived' || Boolean(tourEnd && Date.now() > tourEnd.getTime());
  const tourLive = !tourComplete && (tour?.status === 'active' || Boolean(tourStart && tourEnd && Date.now() >= tourStart.getTime() && Date.now() <= tourEnd.getTime()));
  const upNextFormat = nextRound?.formatLabel ?? (nextTee?.match.format ? formatMatchFormat(nextTee.match.format) : undefined) ?? 'Format TBC';
  const upNextTime = normalizeTeeTime(nextTee?.match.teeTime) ?? normalizeTeeTime(nextRound?.teeTime) ?? 'TBC';
  const tourCourses = courseGuidesForTour(tour, rounds, activeData.summary.tourCourses);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const latestResultCard = <a className="card tappable-card latest-result-card" href="/matches">
    <div className="section-heading"><div><p className="eyebrow">{tourComplete ? 'Tour results' : 'Latest result'}</p><h2>{tourComplete ? 'Final results' : 'Latest result'}</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
    {latestRound ? <div className="latest-round-results"><p><strong>{formatRoundDisplayName(latestRound.round)}</strong>{latestRound.round.roundDate ? ` · ${formatShortDate(latestRound.round.roundDate)}` : ''} · {roundScore(latestRound.matches)}</p>{latestRound.matches.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />)}</div> : !latestResult ? <p>No results yet</p> : <MatchCard match={latestResult} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === latestResult.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />}
  </a>;

  return <div className={`page-stack dashboard-page ${tourLive ? 'tour-is-live' : tourComplete ? 'tour-is-complete' : 'tour-is-upcoming'}`}>
    {loading && <p className="card">Loading…</p>}
    {error && <p className="card form-error">Data could not be loaded. Please refresh.</p>}

    {!tourComplete && <section className="countdown-card card home-intro-card">
      <p className="eyebrow">{tourLive ? 'Live now' : 'Tour countdown'}</p>
      {'state' in countdown ? <strong>{countdown.state}</strong> : <div className="countdown-grid">
        <span><b>{countdown.days}</b><small>days</small></span>
        <span><b>{countdown.hours}</b><small>hours</small></span>
        <span><b>{countdown.minutes}</b><small>minutes</small></span>
        <span><b>{countdown.seconds}</b><small>seconds</small></span>
      </div>}
      <span>{formatTourDisplayName(tour)}</span>
    </section>}

    <section className="score-feature card">
      <div className="section-heading"><div><p className="eyebrow">{tourComplete ? 'Final score' : tourLive ? 'Live team score' : 'Team score'}</p><h2>{tourComplete ? 'Final score' : 'Team score'}</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
      <Scoreboard scores={teamRows} href="/score" />
    </section>

    {!tourComplete && <a className="card tappable-card home-up-next" href="/matches">
      <div className="up-next-copy">
        <p className="eyebrow">{tourLive ? 'On course' : 'Up next'}</p>
        <h2>{nextRound ? formatRoundDisplayName(nextRound) : 'Next round TBC'}</h2>
        <p>{nextRound?.courseName ?? 'Course TBC'}{nextRound?.roundDate ? ` · ${formatShortDate(nextRound.roundDate)}` : ''}</p>
        <div className="up-next-meta"><span>{upNextFormat}</span><span>{nextRound?.holes ?? 18} holes</span></div>
      </div>
      <div className="up-next-time"><small>First tee</small><strong>{upNextTime}</strong><span className="card-chevron" aria-hidden="true">›</span></div>
    </a>}

    {tourComplete && latestResultCard}

    <CourseRail compact title="Know the courses" eyebrow={tourCourses.map((course) => course.shortName).join(' · ') || 'Course preparation'} courses={tourCourses} />

    <a className="card tappable-card home-this-tour-card" href="/tours">
      <div><p className="eyebrow">This tour</p><h2>Teams, schedule & tour info</h2><p>Players, course guides and the full itinerary now live together under Tours.</p></div>
      <span className="card-chevron" aria-hidden="true">›</span>
    </a>

    {!tourComplete && <section className="overview-highlight-grid">
      <a className="card tappable-card victory-card" href="/score">
        <p className="eyebrow">Points target</p>
        <h3>{pointsToWinOutright === undefined ? 'Target TBC' : `${formatPoints(pointsToWinOutright)} to win`}</h3>
        {pointsToWinOutright !== undefined && <p>{formatPoints(totalPointsAvailable)} available · {formatPoints(remainingPoints)} remaining</p>}
        <span className="card-chevron" aria-hidden="true">›</span>
      </a>
    </section>}

    {!tourComplete && latestResultCard}

  </div>;
}
