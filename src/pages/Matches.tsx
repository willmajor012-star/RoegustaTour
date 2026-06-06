import { useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { currentTourId, matchParticipants, matches, players, rounds, tourTeams } from '../data/mockData';
import type { MatchFormat } from '../lib/types';

const formats: Array<'all' | MatchFormat> = ['all', 'singles', 'better_ball', 'scramble', 'custom'];
export function Matches() {
  const [roundId, setRoundId] = useState('all');
  const [format, setFormat] = useState<'all' | MatchFormat>('all');
  const filtered = matches.filter((match) => match.tourId === currentTourId && (roundId === 'all' || match.roundId === roundId) && (format === 'all' || match.format === format));
  const completed = filtered.filter((match) => match.status === 'complete');
  const upcoming = filtered.filter((match) => match.status !== 'complete');
  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Match planner</p><h2>Matches</h2></section><div className="filters"><select value={roundId} onChange={(event) => setRoundId(event.target.value)}><option value="all">All rounds</option>{rounds.filter((round) => round.tourId === currentTourId).map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select><select value={format} onChange={(event) => setFormat(event.target.value as 'all' | MatchFormat)}>{formats.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></div><section><h2>Upcoming / active</h2>{upcoming.map((match) => <MatchCard key={match.id} match={match} participants={matchParticipants.filter((p) => p.matchId === match.id)} players={players} teams={tourTeams} />)}</section><section><h2>Completed</h2>{completed.map((match) => <MatchCard key={match.id} match={match} participants={matchParticipants.filter((p) => p.matchId === match.id)} players={players} teams={tourTeams} />)}</section></div>;
}
