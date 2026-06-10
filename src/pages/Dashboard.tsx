import { useEffect, useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { Scoreboard } from '../components/Scoreboard';
import { formatDate, formatPoints, formatShortDate } from '../lib/formatting';
import { fetchPublicBetMarkets, fetchPublicMatches, fetchPublicScore, fetchPublicSummary, type PublicBetMarketsResponse, type PublicMatchesResponse, type PublicScoreResponse, type PublicSummaryResponse } from '../lib/publicApi';
import type { Match, Round, TeamScoreRow, TourTeam } from '../lib/types';
import { usePublicData } from '../lib/usePublicData';

type DashboardData = {
  summary: Omit<PublicSummaryResponse, 'source'>;
  score: Omit<PublicScoreResponse, 'source'>;
  matches: Omit<PublicMatchesResponse, 'source'>;
  betting: Omit<PublicBetMarketsResponse, 'source'>;
  source: 'supabase';
};

type CountdownState = { label: string; value: string; complete?: boolean };

const emptyDashboardData: DashboardData = {
  source: 'supabase',
  summary: { rounds: [], recentResults: [], openMarkets: [] },
  score: { teams: [], rounds: [], matches: [], scores: [] },
  matches: { rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [] },
  betting: { betMarkets: [], betOptions: [], bets: [] },
};

async function fetchDashboardData(): Promise<DashboardData> {
  const [summary, score, matches, betting] = await Promise.all([fetchPublicSummary(), fetchPublicScore(), fetchPublicMatches(), fetchPublicBetMarkets()]);
  return { summary, score, matches, betting, source: 'supabase' };
}

function getDateTime(date?: string, time?: string) {
  if (!date) return undefined;
  const timePart = time && /^\d{1,2}:\d{2}/.test(time) ? time : '00:00';
  const value = new Date(`${date}T${timePart}`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

function getCountdown(startDate?: string, endDate?: string, status?: string): CountdownState {
  if (!startDate) return { label: 'Tour countdown', value: 'Tour date TBC' };
  const now = new Date();
  const start = getDateTime(startDate);
  const end = getDateTime(endDate, '23:59');
  if (!start) return { label: 'Tour countdown', value: 'Tour date TBC' };
  if (end && now > end && (status === 'complete' || status === 'archived')) return { label: 'Tour countdown', value: 'Tour complete', complete: true };
  if (now >= start && (!end || now <= end)) return { label: 'Tour countdown', value: 'Tour underway' };
  const totalSeconds = Math.max(0, Math.floor((start.getTime() - now.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { label: 'Tour countdown', value: `${days}d ${hours}h ${minutes}m ${seconds}s` };
}

function sortBySchedule(a: { round?: Round; match?: Match }, b: { round?: Round; match?: Match }) {
  const aDate = getDateTime(a.round?.roundDate, a.match?.teeTime ?? a.round?.teeTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bDate = getDateTime(b.round?.roundDate, b.match?.teeTime ?? b.round?.teeTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return aDate - bDate || (a.match?.matchNumber ?? 0) - (b.match?.matchNumber ?? 0);
}

function teamScoreRows(scores: TeamScoreRow[], teams: TourTeam[]): TeamScoreRow[] {
  const rows = scores.length > 0 ? scores : teams.slice(0, 2).map((team) => ({ teamId: team.id, teamName: team.name, colour: team.colour, points: 0, pointsByRound: {} }));
  const fallback: TeamScoreRow[] = [
    { teamId: 'team-1-tbc', teamName: 'Team 1 TBC', colour: '#062B22', points: 0, pointsByRound: {} },
    { teamId: 'team-2-tbc', teamName: 'Team 2 TBC', colour: '#7A1E1E', points: 0, pointsByRound: {} },
  ];
  return [rows[0] ?? fallback[0], rows[1] ?? fallback[1]];
}

export function Dashboard() {
  const { data, loading, error } = usePublicData(fetchDashboardData);
  const [nowTick, setNowTick] = useState(0);
  const activeData = data ?? emptyDashboardData;
  const tour = activeData.summary.tour ?? activeData.score.tour ?? activeData.matches.tour;
  const rounds = activeData.summary.rounds.length > 0 ? activeData.summary.rounds : activeData.score.rounds.length > 0 ? activeData.score.rounds : activeData.matches.rounds;
  const roundById = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds]);
  const visibleMatches = activeData.matches.matches.filter((match) => match.status !== 'draft' && match.status !== 'void');
  const teamRows = teamScoreRows(activeData.score.scores, activeData.score.teams.length > 0 ? activeData.score.teams : activeData.matches.tourTeams);
  const totalPointsAvailable = visibleMatches.reduce((sum, match) => sum + match.pointsAvailable, 0);
  const remainingPoints = visibleMatches.filter((match) => match.status !== 'complete').reduce((sum, match) => sum + match.pointsAvailable, 0);
  const pointsToWinOutright = totalPointsAvailable > 0 ? totalPointsAvailable / 2 + 0.5 : undefined;
  const scheduled = visibleMatches
    .filter((match) => match.status === 'planned' || match.status === 'active' || match.status !== 'complete')
    .map((match) => ({ match, round: roundById.get(match.roundId) }))
    .filter((item) => item.match.status !== 'complete')
    .sort(sortBySchedule);
  const nextTee = scheduled[0];
  const nextRound = nextTee?.round ?? rounds.find((round) => round.status !== 'complete');
  const latestResult = [...visibleMatches]
    .filter((match) => match.status === 'complete')
    .sort((a, b) => sortBySchedule({ match: b, round: roundById.get(b.roundId) }, { match: a, round: roundById.get(a.roundId) }))[0];
  const countdown = getCountdown(tour?.startDate, tour?.endDate, tour?.status);
  const openMarkets = activeData.betting.betMarkets.filter((market) => market.status === 'open');

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  void nowTick;

  return <div className="page-stack overview-page">
    {loading && <p className="card">Loading tour data…</p>}
    {error && <p className="card form-error">{error}</p>}

    <section className="countdown-card card">
      <p className="eyebrow">Tour countdown</p>
      <strong>{countdown.value}</strong>
      <span>{tour?.startDate ? `${formatDate(tour.startDate)} — ${formatDate(tour.endDate)}` : 'Tour date TBC'}</span>
    </section>

    <a className="score-feature card tappable-card" href="/matches">
      <div className="section-heading"><div><p className="eyebrow">Team score</p><h2>Team score</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
      <Scoreboard scores={teamRows} rounds={activeData.score.rounds} />
    </a>

    <section className="overview-highlight-grid">
      <a className="card tappable-card victory-card" href="/matches">
        <p className="eyebrow">Points to victory</p>
        <h3>{pointsToWinOutright === undefined ? 'Points target TBC' : `${formatPoints(pointsToWinOutright)} to win`}</h3>
        {pointsToWinOutright !== undefined && <p>{formatPoints(remainingPoints)} points remaining</p>}
        <span className="card-chevron" aria-hidden="true">›</span>
      </a>
      <a className="next-tee-card card tappable-card" href="/matches">
        <p className="eyebrow">Next tee</p>
        <h3>{nextRound?.name ?? 'Next tee TBC'}</h3>
        {nextRound ? <p>{nextRound.courseName ?? 'Course TBC'} · {formatShortDate(nextRound.roundDate)}</p> : <p>Next tee TBC</p>}
        <div className="tee-time-lockup"><strong>{nextTee?.match.teeTime ?? nextRound?.teeTime ?? 'TBC'}</strong><span className="card-chevron" aria-hidden="true">›</span></div>
      </a>
    </section>

    <a className="card tappable-card latest-result-card" href="/matches">
      <div className="section-heading"><div><p className="eyebrow">Latest result</p><h2>Latest result</h2></div><span className="card-chevron" aria-hidden="true">›</span></div>
      {!latestResult ? <p>No results yet</p> : <MatchCard match={latestResult} participants={activeData.matches.matchParticipants.filter((p) => p.matchId === latestResult.id)} players={activeData.matches.players} teams={activeData.matches.tourTeams} />}
    </a>

    <div className="quick-link-grid">
      <a className="card tappable-card" href="/matches"><strong>Results</strong><span>›</span></a>
      <a className="card tappable-card" href="/teams"><strong>Teams</strong><span>›</span></a>
      <a className="card tappable-card" href="/stats"><strong>Stats</strong><span>›</span></a>
      <a className="card tappable-card" href="/betting"><strong>Bet Punto</strong><small>{openMarkets.length} open</small><span>›</span></a>
      <a className="card tappable-card" href="/info"><strong>Info</strong><span>›</span></a>
    </div>
  </div>;
}
