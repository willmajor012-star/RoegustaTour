import { useEffect, useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { CourseRail } from '../components/CourseRail';
import { Scoreboard } from '../components/Scoreboard';
import { WinPredictor } from '../components/WinPredictor';
import { formatMatchFormat, formatPoints, formatShortDate } from '../lib/formatting';
import { fetchPublicDashboard, type PublicDashboardResponse } from '../lib/publicApi';
import type { Match, Round, TeamScoreRow, TourTeam } from '../lib/types';
import { formatRoundDisplayName, formatTourDisplayName, getScheduledDate, getScheduleSortTime, isPublicVisibleMatch, normalizeTeeTime } from '../lib/display';
import { usePublicData } from '../lib/usePublicData';
import { TEAM_COLOUR_FALLBACKS, normalizeTeamColour } from '../lib/teamColours';
import { awardedPoints, pointsRequiredToWinOutright, projectedTourPoints } from '../lib/matchplay';
import { courseGuidesForTour } from '../data/courseGuides';
import { tourLifecycle } from '../lib/tourState';
import { zonedLocalDateTimeToIso } from '../lib/tourTime';

const emptyDashboardData: PublicDashboardResponse = {
  source: 'supabase',
  rounds: [],
  matches: [],
  matchParticipants: [],
  players: [],
  tourPlayers: [],
  tourTeams: [],
  tourTeamMembers: [],
  roundPrizeResults: [],
  tourCourses: [],
  recentResults: [],
  openMarkets: [],
  scores: [],
};

function countdownParts(start?: Date, end?: Date, status?: string) {
  const now = new Date();
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


export function teamScoreRows(scores: TeamScoreRow[], teams: TourTeam[]): TeamScoreRow[] {
  // Keep both teams on the same side as the predictor when the lead changes.
  const orderedTeams = [...teams].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const rows = orderedTeams.length >= 2 ? orderedTeams.slice(0, 2).map((team, index) => scores.find((row) => row.teamId === team.id) ?? ({ teamId: team.id, teamName: team.name, colour: normalizeTeamColour(team.colour, index), points: 0, pointsByRound: {} })) : scores;
  return [
    rows[0] ?? { teamId: 'score-left-unavailable', teamName: 'Team TBC', colour: TEAM_COLOUR_FALLBACKS[0], points: 0, pointsByRound: {} },
    rows[1] ?? { teamId: 'score-right-unavailable', teamName: 'Team TBC', colour: TEAM_COLOUR_FALLBACKS[1], points: 0, pointsByRound: {} },
  ];
}

export function Dashboard() {
  const { data, loading, error } = usePublicData(fetchPublicDashboard);
  const [, setTick] = useState(0);
  const activeData = data ?? emptyDashboardData;
  const tour = activeData.tour;
  const rounds = activeData.rounds;
  const roundById = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds]);
  const visibleMatches = activeData.matches.filter(isPublicVisibleMatch);
  const teamRows = teamScoreRows(activeData.scores, activeData.tourTeams);
  const totalPointsAvailable = activeData.projectedTotalPoints && activeData.projectedTotalPoints > 0
    ? activeData.projectedTotalPoints
    : projectedTourPoints(
      rounds,
      visibleMatches,
      activeData.tourTeams,
      activeData.tourTeamMembers,
      activeData.tourPlayers,
      activeData.attendingPlayerCount,
    );
  const remainingPoints = totalPointsAvailable - (tour?.rulesVersion ? activeData.scores.reduce((sum, row) => sum + row.points, 0) : awardedPoints(visibleMatches));
  const pointsToWinOutright = pointsRequiredToWinOutright(totalPointsAvailable);
  const scheduled = visibleMatches
    .filter((match) => match.status !== 'complete')
    .map((match) => ({ match, round: roundById.get(match.roundId) }))
    .sort((a, b) => getScheduleSortTime(a.round?.roundDate, a.match.teeTime ?? a.round?.teeTime) - getScheduleSortTime(b.round?.roundDate, b.match.teeTime ?? b.round?.teeTime) || a.match.matchNumber - b.match.matchNumber);
  const nextTee = scheduled[0];
  const sortedRounds = [...rounds].sort((a, b) => getScheduleSortTime(a.roundDate, a.teeTime) - getScheduleSortTime(b.roundDate, b.teeTime) || a.roundNumber - b.roundNumber);
  const nextRound = nextTee?.round ?? sortedRounds.find((round) => round.status === 'active') ?? sortedRounds.find((round) => getScheduleSortTime(round.roundDate, round.teeTime) >= Date.now()) ?? sortedRounds[0];
  const latestRound = latestCompletedRound(rounds, visibleMatches);
  const latestResult = latestRound ? undefined : ([...visibleMatches].filter((match) => match.status === 'complete').sort((a, b) => (getScheduledDate(roundById.get(b.roundId)?.roundDate, b.teeTime)?.getTime() ?? 0) - (getScheduledDate(roundById.get(a.roundId)?.roundDate, a.teeTime)?.getTime() ?? 0) || b.matchNumber - a.matchNumber)[0] ?? activeData.recentResults[0]);
  const { start: tourStart, end: tourEnd, complete: tourComplete, live: tourLive } = tourLifecycle(tour);
  const countdown = countdownParts(tourStart, tourEnd, tour?.status);
  const upNextFormat = nextRound?.formatLabel ?? (nextTee?.match.format ? formatMatchFormat(nextTee.match.format) : undefined) ?? 'Format TBC';
  const upNextTime = normalizeTeeTime(nextTee?.match.teeTime) ?? normalizeTeeTime(nextRound?.teeTime) ?? 'TBC';
  const roundStartIso = nextRound?.roundDate ? zonedLocalDateTimeToIso(nextRound.roundDate, upNextTime, tour?.timezone ?? 'Europe/Lisbon') : undefined;
  const roundEndIso = nextRound?.roundDate ? zonedLocalDateTimeToIso(nextRound.roundDate, '23:59', tour?.timezone ?? 'Europe/Lisbon') : undefined;
  const onCourse = tourLive && nextRound?.status === 'active' && roundStartIso && roundEndIso
    && Date.now() >= Date.parse(roundStartIso) && Date.now() <= Date.parse(roundEndIso) + 59_999;
  const tourCourses = courseGuidesForTour(tour, rounds, activeData.tourCourses)
    .filter((course) => course.showOnHome !== false);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!data) return <div className="page-stack dashboard-page"><p className={`card${error ? ' form-error' : ''}`} role="status">{error ? 'Tour data could not be loaded. Please refresh.' : 'Loading tour…'}</p></div>;

  const latestResultCard = <a className="card tappable-card latest-result-card" href="/matches">
    <div className="section-heading"><div><p className="eyebrow">{tourComplete ? 'Tour results' : 'Latest result'}</p><h2>{tourComplete ? 'Final results' : 'Latest result'}</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
    {latestRound ? <div className="latest-round-results"><p><strong>{formatRoundDisplayName(latestRound.round)}</strong>{latestRound.round.roundDate ? ` · ${formatShortDate(latestRound.round.roundDate)}` : ''} · {roundScore(latestRound.matches)}</p>{latestRound.matches.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.players} teams={activeData.tourTeams} />)}</div> : !latestResult ? <p>No results yet</p> : <MatchCard match={latestResult} participants={activeData.matchParticipants.filter((p) => p.matchId === latestResult.id)} players={activeData.players} teams={activeData.tourTeams} />}
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

    <a className="score-feature card tappable-card" href="/tours/current" aria-label="Team score: open tour overview">
      <div className="section-heading"><div><p className="eyebrow">{tourComplete ? 'Final score' : tourLive ? 'Live team score' : 'Team score'}</p><h2>{tourComplete ? 'Final score' : 'Team score'}</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
      {!tourComplete && <div className="score-target" aria-label="Points target">
        <span>Points target</span>
        <strong>{pointsToWinOutright === undefined ? 'Target TBC' : `${formatPoints(pointsToWinOutright)} to win`}</strong>
        {pointsToWinOutright !== undefined && <small>{formatPoints(totalPointsAvailable)} available · {formatPoints(remainingPoints)} remaining</small>}
      </div>}
      <Scoreboard scores={teamRows} />
      {tour?.rulesVersion === 'confirmed-2026' && <WinPredictor teams={teamRows} />}
    </a>

    {!tourComplete && <a className="card tappable-card home-up-next" href="/matches">
      <div className="up-next-copy">
        <p className="eyebrow">{onCourse ? 'On course' : 'Up next'}</p>
        <h2>{nextRound ? formatRoundDisplayName(nextRound) : 'Next round TBC'}</h2>
        <p>{nextRound?.courseName ?? 'Course TBC'}{nextRound?.roundDate ? ` · ${formatShortDate(nextRound.roundDate)}` : ''}</p>
        <div className="up-next-meta"><span>{upNextFormat}</span><span>{nextRound?.holeCountConfirmed === false ? 'Hole count TBC' : (nextRound?.holes ?? 18) + ' holes'}</span></div>
      </div>
      <div className="up-next-time"><small>First tee</small><strong>{upNextTime}</strong><span className="card-chevron" aria-hidden="true">›</span></div>
    </a>}

    <CourseRail compact title="Know the courses" eyebrow={tourCourses.map((course) => course.shortName).join(' · ') || 'Course preparation'} courses={tourCourses} />

    {latestResultCard}

    <a className="card tappable-card home-this-tour-card" href="/tours">
      <div className="home-this-tour-copy">
        <p className="eyebrow">This tour</p>
        <h2>{formatTourDisplayName(tour)}</h2>
        <p>Teams, players, course guides and itinerary</p>
      </div>
      <div className="home-this-tour-action"><span>Open tour hub</span><span className="card-chevron" aria-hidden="true">›</span></div>
    </a>

  </div>;
}
