import { formatDate } from '../lib/formatting';
import { fetchPublicMatches, fetchPublicScore, fetchPublicSummary } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

async function fetchHeaderData() {
  const [summary, score, matches] = await Promise.all([fetchPublicSummary(), fetchPublicScore(), fetchPublicMatches()]);
  return {
    source: 'supabase' as const,
    tour: summary.tour ?? score.tour ?? matches.tour,
    rounds: summary.rounds.length > 0 ? summary.rounds : score.rounds,
    teams: score.teams,
    players: matches.players,
  };
}

export function BrandHeader() {
  const { data } = usePublicData(fetchHeaderData);
  const tour = data?.tour;
  const courses = new Set((data?.rounds ?? []).map((round) => round.courseName).filter(Boolean));

  return (
    <header className="brand-header">
      <div className="brand-lockup">
        <img className="brand-logo" src="/brand/roegusta-logo-mark.png" alt="Roegusta Tour" />
        <div className="brand-copy">
          <p className="eyebrow">Private golf tour</p>
          <h1>{tour?.name ?? 'Roegusta Tour'}</h1>
          <p className="brand-location">{tour?.location ?? 'Location TBC'}</p>
          <p className="brand-dates">{formatDate(tour?.startDate)} — {formatDate(tour?.endDate)}</p>
        </div>
      </div>
      <div className="brand-meta-row" aria-label="Tour metadata">
        <span>{data?.players.length ?? '—'} players</span>
        <span>{data?.rounds.length ?? '—'} rounds</span>
        <span>{courses.size || '—'} courses</span>
        <span>{data?.teams.length ?? '—'} teams</span>
      </div>
    </header>
  );
}
