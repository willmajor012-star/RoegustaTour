import { useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { currentTourId, matchParticipants, matches, players, rounds, tourTeams } from '../data/mockData';
import type { Match, MatchFormat } from '../lib/types';

const formats: Array<'all' | MatchFormat> = ['all', 'singles', 'better_ball', 'scramble', 'custom'];
const isPublicMatch = (match: Match) => match.published || match.status === 'complete';

export function Matches() {
  const [roundId, setRoundId] = useState('all');
  const [format, setFormat] = useState<'all' | MatchFormat>('all');
  const publicMatches = matches.filter((match) => match.tourId === currentTourId && isPublicMatch(match));
  const filtered = publicMatches.filter((match) => (roundId === 'all' || match.roundId === roundId) && (format === 'all' || match.format === format));
  const completed = filtered.filter((match) => match.status === 'complete');
  const upcoming = filtered.filter((match) => match.status !== 'complete');
  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Published match planner</p><h2>Matches</h2><p>Pairings appear here once captains confirm picks and admin publishes them.</p></section><div className="filters"><select value={roundId} onChange={(event) => setRoundId(event.target.value)}><option value="all">All rounds</option>{rounds.filter((round) => round.tourId === currentTourId).map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select><select value={format} onChange={(event) => setFormat(event.target.value as 'all' | MatchFormat)}>{formats.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></div><section><h2>Upcoming / active</h2>{upcoming.length === 0 && <p className="card">Matches will appear once captains publish the pairings.</p>}{upcoming.map((match) => <MatchCard key={match.id} match={match} participants={matchParticipants.filter((p) => p.matchId === match.id)} players={players} teams={tourTeams} />)}</section><section><h2>Completed</h2>{completed.length === 0 && <p className="card">No published results yet.</p>}{completed.map((match) => <MatchCard key={match.id} match={match} participants={matchParticipants.filter((p) => p.matchId === match.id)} players={players} teams={tourTeams} />)}</section></div>;
}
