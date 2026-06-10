import { useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { fetchPublicMatches, type PublicMatchesResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { formatMatchFormat, formatPoints, formatShortDate } from '../lib/formatting';
import type { MatchFormat } from '../lib/types';

const formatOptions: Array<{ value: 'all' | MatchFormat; label: string }> = [
  { value: 'all', label: 'All formats' },
  { value: 'singles', label: 'Singles' },
  { value: 'better_ball', label: 'Better ball' },
  { value: 'foursomes', label: 'Foursomes' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'custom', label: 'Custom' },
];
const emptyMatchesData: Omit<PublicMatchesResponse, 'source'> = { rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [] };

export function Matches() {
  const [roundId, setRoundId] = useState('all');
  const [format, setFormat] = useState<'all' | MatchFormat>('all');
  const { data, loading, error } = usePublicData(fetchPublicMatches);
  const activeData = data ?? emptyMatchesData;
  const filtered = activeData.matches.filter((match) => (roundId === 'all' || match.roundId === roundId) && (format === 'all' || match.format === format));
  const rounds = activeData.rounds.filter((round) => roundId === 'all' || round.id === roundId);

  return <div className="page-stack results-page"><section className="page-title premium-title"><p className="eyebrow">Published results</p><h2>Results</h2><p>Compact round-by-round matchplay ledger for pairings, results and points.</p></section>
    {loading && <p className="card">Loading results…</p>}
    {error && <p className="card form-error">{error}</p>}
    <div className="filters card"><label><span>Round</span><select value={roundId} onChange={(event) => setRoundId(event.target.value)}><option value="all">All rounds</option>{activeData.rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select></label><label><span>Format</span><select value={format} onChange={(event) => setFormat(event.target.value as 'all' | MatchFormat)}>{formatOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
    {!loading && !error && filtered.length === 0 && <p className="card">Matches will appear once captains publish pairings and results.</p>}
    {rounds.map((round) => {
      const roundMatches = filtered.filter((match) => match.roundId === round.id);
      if (roundMatches.length === 0) return null;
      const complete = roundMatches.filter((match) => match.status === 'complete');
      const sideAPoints = complete.reduce((sum, match) => sum + (match.pointsSideA ?? 0), 0);
      const sideBPoints = complete.reduce((sum, match) => sum + (match.pointsSideB ?? 0), 0);
      const roundFormats = [...new Set(roundMatches.map((match) => formatMatchFormat(match.format)))].join(' / ');
      return <section className="round-results card" key={round.id}>
        <div className="round-results-header">
          <div><p className="eyebrow">Round {round.roundNumber}</p><h3>{round.name}</h3><p>{round.courseName ?? 'Course TBC'} · {formatShortDate(round.roundDate)}</p><span className="round-format-label">{round.formatLabel ?? roundFormats}</span></div>
          <div className="round-score"><span>Round score</span><strong>{formatPoints(sideAPoints)}–{formatPoints(sideBPoints)}</strong></div>
        </div>
        <div className="round-match-list">{roundMatches.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.players} teams={activeData.tourTeams} />)}</div>
      </section>;
    })}
  </div>;
}
