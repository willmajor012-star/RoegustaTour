import { useEffect, useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { fetchPublicMatches, type PublicMatchesResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { formatMatchFormat, formatPoints, formatShortDate } from '../lib/formatting';
import { formatRoundDisplayName, isPublicVisibleMatch, normalizeTeeTime } from '../lib/display';
import { calculateTeamScoreByTour } from '../lib/scoring';
import type { Match, MatchParticipant, Player, Round, TourTeam } from '../lib/types';

const emptyMatchesData: Omit<PublicMatchesResponse, 'source'> = { tour: undefined, rounds: [], matches: [], matchParticipants: [], players: [], tourTeams: [] };

function roundSession(round?: Round) {
  const match = round?.notes?.match(/^\[Session: (AM|PM|TBC)\]/);
  return match?.[1];
}

function tourStatusLabel(status?: string, matches: Match[] = []) {
  if (status === 'complete' || matches.length > 0 && matches.every((match) => match.status === 'complete')) return 'Complete';
  if (status === 'active' || matches.some((match) => match.status === 'active')) return 'Live';
  return 'Upcoming';
}

function pairingText(match: Match, participants: MatchParticipant[], players: Player[], teams: TourTeam[]) {
  const nameFor = (playerId: string) => players.find((player) => player.id === playerId)?.displayName;
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId)?.name;
  const sidePlayers = (side: 'A' | 'B') => participants.filter((participant) => participant.side === side).map((participant) => nameFor(participant.playerId)).filter(Boolean).join(' / ');
  const sideA = sidePlayers('A') || match.sideALabel || teamFor(match.sideATeamId) || 'Side A TBC';
  const sideB = sidePlayers('B') || match.sideBLabel || teamFor(match.sideBTeamId) || 'Side B TBC';
  return `${sideA} v ${sideB}`;
}

export function Matches() {
  const [roundId, setRoundId] = useState('');
  const { data, loading, error } = usePublicData(fetchPublicMatches, { onErrorMessage: 'Golf schedule could not be loaded. Please refresh.' });
  const activeData = data ?? emptyMatchesData;
  const publicMatches = activeData.matches.filter(isPublicVisibleMatch);
  const selectedRound = activeData.rounds.find((round) => round.id === roundId) ?? activeData.rounds[0];
  const selectedRoundMatches = selectedRound ? publicMatches.filter((match) => match.roundId === selectedRound.id) : [];
  const selectedCompleteMatches = selectedRoundMatches.filter((match) => match.status === 'complete');
  const inProgressCount = selectedRoundMatches.filter((match) => match.status === 'active').length;
  const remainingCount = selectedRoundMatches.filter((match) => match.status !== 'complete').length;
  const scoreRows = activeData.tour ? calculateTeamScoreByTour(activeData.tour.id, activeData.tourTeams, activeData.rounds, publicMatches) : [];
  const roundScoreRows = selectedRound ? scoreRows.map((row) => ({ ...row, points: row.pointsByRound[selectedRound.id] ?? 0 })).filter((row) => row.points > 0).sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName)) : [];
  const teeSheetMatches = [...selectedRoundMatches].sort((a, b) => (normalizeTeeTime(a.teeTime) ?? '99:99').localeCompare(normalizeTeeTime(b.teeTime) ?? '99:99') || a.matchNumber - b.matchNumber);
  const hasTeeTimes = teeSheetMatches.some((match) => normalizeTeeTime(match.teeTime));
  const roundFormats = [...new Set(selectedRoundMatches.map((match) => formatMatchFormat(match.format)))].join(' / ');
  const roundSessionLabel = roundSession(selectedRound);

  useEffect(() => {
    if (!roundId && activeData.rounds[0]) setRoundId(activeData.rounds[0].id);
    if (roundId && activeData.rounds.length > 0 && !activeData.rounds.some((round) => round.id === roundId)) setRoundId(activeData.rounds[0].id);
  }, [activeData.rounds, roundId]);

  const tourScoreSummary = useMemo(() => scoreRows.map((row) => `${row.teamName} ${formatPoints(row.points)}`).join(' · '), [scoreRows]);

  return <div className="page-stack results-page golf-page"><section className="page-title premium-title"><h2>Golf</h2></section>
    {loading && <p className="card">Loading golf schedule...</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && <>
      <section className="card golf-status-card"><div><p className="eyebrow">Current tour</p><h3>{activeData.tour?.name ?? 'Current tour'}</h3><p>{selectedRound ? `Current round: ${formatRoundDisplayName(selectedRound)}` : 'Rounds TBC'} · {tourStatusLabel(activeData.tour?.status, publicMatches)}</p></div><div className="chip-list">{scoreRows.length === 0 ? <span className="pill">Team scores TBC</span> : scoreRows.map((row) => <span className="pill" key={row.teamId}>{row.teamName} {formatPoints(row.points)}</span>)}</div>{tourScoreSummary && <small>{tourScoreSummary}</small>}</section>
      {activeData.rounds.length === 0 ? <p className="card">Pairings and tee times will appear once published.</p> : <label className="filters card golf-round-selector"><span>Round</span><select value={selectedRound?.id ?? ''} onChange={(event) => setRoundId(event.target.value)}>{activeData.rounds.map((round, index) => <option key={round.id} value={round.id}>{formatRoundDisplayName(round, index)}</option>)}</select></label>}
      {selectedRound && <section className="card round-info-card"><p className="eyebrow">Round information</p><h3>{formatRoundDisplayName(selectedRound)}</h3><div className="golf-info-grid"><span>Date <strong>{formatShortDate(selectedRound.roundDate)}</strong></span><span>Course <strong>{selectedRound.courseName ?? 'Course TBC'}</strong></span><span>Format <strong>{selectedRound.formatLabel ?? (roundFormats || 'Format TBC')}</strong></span><span>Session <strong>{roundSessionLabel ?? 'TBC'}</strong></span><span>Tee time <strong>{normalizeTeeTime(selectedRound.teeTime) ?? 'TBC'}</strong></span><span>Status <strong>{selectedRound.status}</strong></span></div></section>}
      {selectedRound && <section className="card tee-sheet-card"><div className="section-heading"><div><p className="eyebrow">Tee sheet</p><h3>Order of play</h3></div></div>{selectedRoundMatches.length === 0 ? <p>Pairings and tee times will appear once published.</p> : !hasTeeTimes ? <p>Tee times will appear once published.</p> : <div className="tee-sheet-list">{teeSheetMatches.map((match) => { const participants = activeData.matchParticipants.filter((participant) => participant.matchId === match.id); return <div className="tee-sheet-row" key={match.id}><strong>{normalizeTeeTime(match.teeTime) ?? 'TBC'}</strong><span>Match {match.matchNumber}</span><p>{pairingText(match, participants, activeData.players, activeData.tourTeams)}</p></div>; })}</div>}</section>}
      {selectedRound && <section className="round-results card"><div className="round-results-header"><div><p className="eyebrow">Pairings and results</p><h3>{formatRoundDisplayName(selectedRound)}</h3><p>{selectedCompleteMatches.length} complete · {inProgressCount} in progress · {remainingCount} remaining</p></div>{selectedCompleteMatches.length > 0 && <div className="round-score"><span>Matches complete</span><strong>{selectedCompleteMatches.length}/{selectedRoundMatches.length}</strong></div>}</div>{selectedRoundMatches.length === 0 ? <p>Pairings and tee times will appear once published.</p> : <div className="round-match-list">{selectedRoundMatches.map((match) => <MatchCard key={match.id} match={match} participants={activeData.matchParticipants.filter((p) => p.matchId === match.id)} players={activeData.players} teams={activeData.tourTeams} />)}</div>}</section>}
      {selectedRound && <section className="card round-summary-card"><p className="eyebrow">Round summary</p><h3>Round score</h3>{roundScoreRows.length === 0 ? <p>Round scoring will appear once results are entered.</p> : <div className="chip-list">{roundScoreRows.map((row) => <span className="pill" key={row.teamId}>{row.teamName} {formatPoints(row.points)}</span>)}</div>}</section>}
    </>}
  </div>;
}
