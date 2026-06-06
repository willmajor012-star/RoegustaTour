import { useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { fetchPublicMatches, type PublicMatchesResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import type { MatchFormat } from '../lib/types';

const formats: Array<'all' | MatchFormat> = ['all', 'singles', 'better_ball', 'scramble', 'custom'];
const emptyMatchesData: Omit<PublicMatchesResponse, 'source'> = { rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [] };

export function Matches() {
  const [roundId, setRoundId] = useState('all');
  const [format, setFormat] = useState<'all' | MatchFormat>('all');
  const { data, loading, error } = usePublicData(fetchPublicMatches);
  const activeData = data ?? emptyMatchesData;
  const filtered = activeData.matches.filter((match) => (roundId === 'all' || match.roundId === roundId) && (format === 'all' || match.format === format));
  const completed = filtered.filter((match) => match.status === 'complete');
  const upcoming = filtered.filter((match) => match.status !== 'complete');

  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Published match planner</p><h2>Matches</h2><p>Pairings appear here once captains confirm picks and admin publishes them.</p></section>
    {loading && <p className="card">Loading matches…</p>}
    {error && <p className="card form-error">{error}</p>}
    <div className="filters"><select value={roundId} onChange={(event) => setRoundId(event.target.value)}><option value="all">All rounds</option>{activeData.rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select><select value={format} onChange={(event) => setFormat(event.target.value as 'all' | MatchFormat)}>{formats.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></div>
    <section><h2>Upcoming / active</h2>{!loading && !error && upcoming.length === 0 && <p className="card">Matches will appear once captains publish the pairings.</p>}{upcoming.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.players} teams={activeData.tourTeams} />)}</section>
    <section><h2>Completed</h2>{!loading && !error && completed.length === 0 && <p className="card">No results have been entered yet.</p>}{completed.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.players} teams={activeData.tourTeams} />)}</section></div>;
}
