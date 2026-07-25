import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MatchCard } from '../components/MatchCard';
import { PageHeader } from '../components/PageHeader';
import { fetchPublicMatches, type PublicMatchesResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { formatMatchFormat, formatPoints, formatShortDate } from '../lib/formatting';
import { compareTeeTimeValues, formatRoundDisplayName, formatTeeTimeDisplay, getScheduleSortTime, isPublicVisibleMatch, publicWorkflowStatusLabel, roundSession } from '../lib/display';
import { tourPointsTarget } from '../lib/golf';
import { calculateTeamScoreByTour } from '../lib/scoring';
import { normalizeTeamColour } from '../lib/teamColours';
import type { Match, MatchParticipant, Player, Round, RoundPrizeResult, TourPlayer, TourTeam, TourTeamMember } from '../lib/types';
import { courseGuideForRound, courseGuidePath, courseGuidesForTour } from '../data/courseGuides';

const emptyMatchesData: Omit<PublicMatchesResponse, 'source'> = { tour: undefined, rounds: [], matches: [], matchParticipants: [], players: [], tourPlayers: [], tourTeams: [], tourTeamMembers: [], roundPrizeResults: [], tourCourses: [] };
type GolfSection = 'tee-sheet' | 'results' | 'prizes' | 'teams';
const golfSections: Array<{ value: GolfSection; label: string }> = [
  { value: 'tee-sheet', label: 'Tee sheet' },
  { value: 'results', label: 'Results' },
  { value: 'prizes', label: 'Prizes' },
  { value: 'teams', label: 'Teams' },
];

function pairingText(match: Match, participants: MatchParticipant[], players: Player[], teams: TourTeam[]) {
  const nameFor = (playerId: string) => players.find((player) => player.id === playerId)?.displayName;
  const teamFor = (teamId: string) => teams.find((team) => team.id === teamId)?.name;
  const sidePlayers = (side: 'A' | 'B') => participants.filter((participant) => participant.side === side).map((participant) => nameFor(participant.playerId)).filter(Boolean).join(' / ');
  const sideA = sidePlayers('A') || match.sideALabel || teamFor(match.sideATeamId) || 'Team 1 TBC';
  const sideB = sidePlayers('B') || match.sideBLabel || teamFor(match.sideBTeamId) || 'Team 2 TBC';
  return `${sideA} v ${sideB}`;
}

function roundTeamScore(matches: Match[]) {
  const complete = matches.filter((match) => match.status === 'complete');
  if (complete.length === 0) return undefined;
  const sideA = complete.reduce((sum, match) => sum + (match.pointsSideA ?? 0), 0);
  const sideB = complete.reduce((sum, match) => sum + (match.pointsSideB ?? 0), 0);
  return `${formatPoints(sideA)}–${formatPoints(sideB)}`;
}

function firstUsefulRound(rounds: Round[], matches: Match[]) {
  const ordered = [...rounds].sort((a, b) => getScheduleSortTime(a.roundDate, a.teeTime) - getScheduleSortTime(b.roundDate, b.teeTime) || a.roundNumber - b.roundNumber);
  return ordered.find((round) => round.status === 'active')
    ?? ordered.find((round) => matches.some((match) => match.roundId === round.id && match.status !== 'complete'))
    ?? ordered[0];
}

function roundTabTitle(round: Round) {
  const day = formatShortDate(round.roundDate).split(',')[0];
  const session = roundSession(round);
  return [day !== 'TBC' ? day : `Round ${round.roundNumber}`, session].filter(Boolean).join(' ') || `Round ${round.roundNumber}`;
}

export function Matches() {
  const [roundId, setRoundId] = useState('');
  const [section, setSection] = useState<GolfSection>('tee-sheet');
  const { data, loading, error } = usePublicData(fetchPublicMatches, { onErrorMessage: 'Golf schedule could not be loaded. Please refresh.' });
  const activeData = data ?? emptyMatchesData;
  const publicMatches = activeData.matches.filter(isPublicVisibleMatch);
  const orderedRounds = useMemo(() => [...activeData.rounds].sort((a, b) => getScheduleSortTime(a.roundDate, a.teeTime) - getScheduleSortTime(b.roundDate, b.teeTime) || a.roundNumber - b.roundNumber), [activeData.rounds]);
  const tourCourses = courseGuidesForTour(activeData.tour, orderedRounds, activeData.tourCourses);
  const selectedRound = orderedRounds.find((round) => round.id === roundId) ?? firstUsefulRound(orderedRounds, publicMatches);
  const selectedRoundMatches = selectedRound ? publicMatches.filter((match) => match.roundId === selectedRound.id) : [];
  const selectedCourseGuide = courseGuideForRound(selectedRound, tourCourses);
  const teeSheetMatches = [...selectedRoundMatches].sort((a, b) => compareTeeTimeValues(a.teeTime, b.teeTime) || a.matchNumber - b.matchNumber);
  const selectedPrizes = selectedRound ? activeData.roundPrizeResults.filter((prize) => prize.roundId === selectedRound.id) : [];
  const scoreRows = activeData.tour ? calculateTeamScoreByTour(activeData.tour.id, activeData.tourTeams, activeData.rounds, publicMatches) : [];
  const { totalAvailablePoints, pointsToWin } = tourPointsTarget(publicMatches);

  useEffect(() => {
    if (!roundId && selectedRound) setRoundId(selectedRound.id);
    if (roundId && orderedRounds.length > 0 && !orderedRounds.some((round) => round.id === roundId)) setRoundId(firstUsefulRound(orderedRounds, publicMatches)?.id ?? orderedRounds[0].id);
  }, [orderedRounds, publicMatches, roundId, selectedRound]);

  return <div className="page-stack results-page golf-page">
    <PageHeader title="Golf" eyebrow={activeData.tour?.name ?? 'Current tour'} />
    {loading && <p className="card">Loading golf schedule...</p>}
    {error && <p className="card form-error">{error}</p>}
    {!loading && !error && <>
      <section className="golf-score-strip" aria-label="Tour score summary">
        {scoreRows.length >= 2 ? scoreRows.slice(0, 2).map((row, index) => <span className="team-score-pill" key={row.teamId} style={{ '--team-colour': normalizeTeamColour(row.colour, index) } as CSSProperties}><small>{row.teamName || `Team ${index + 1}`}</small><b>{formatPoints(row.points)}</b></span>) : <span className="golf-summary-pill"><small>Score</small><b>TBC</b></span>}
        <span className="golf-summary-pill"><small>To win</small><b>{formatPoints(pointsToWin)}</b></span>
        <span className="golf-summary-pill optional"><small>Available</small><b>{formatPoints(totalAvailablePoints)}</b></span>
      </section>

      {orderedRounds.length === 0 ? <p className="card">Rounds, pairings and tee times will appear once published.</p> : <>
        <nav className="round-card-strip" aria-label="Choose a round">
          {orderedRounds.map((round) => <button type="button" key={round.id} className={selectedRound?.id === round.id ? 'active' : ''} aria-pressed={selectedRound?.id === round.id} onClick={() => { setRoundId(round.id); setSection('tee-sheet'); }}>
            <span>{roundTabTitle(round)}</span>
            <strong>{round.courseName ?? formatRoundDisplayName(round)}</strong>
            <small>{round.formatLabel ?? formatMatchFormat(round.format ?? 'custom')}</small>
          </button>)}
        </nav>

        {selectedRound && <section className="selected-round-header card">
          <div className="selected-round-heading">
            <div><p className="eyebrow">{formatRoundDisplayName(selectedRound)}</p><h2>{selectedRound.courseName ?? 'Course TBC'}</h2><p>{selectedRound.formatLabel ?? formatMatchFormat(selectedRound.format ?? 'custom')}</p></div>
            <div className="selected-round-actions">
              {publicWorkflowStatusLabel(selectedRound.status) && <span className="tour-status-badge">{publicWorkflowStatusLabel(selectedRound.status)}</span>}
              {selectedCourseGuide && <a className="round-course-guide-link" href={courseGuidePath(selectedCourseGuide)}>Course guide <span aria-hidden="true">›</span></a>}
            </div>
          </div>
          <RoundMeta selectedRound={selectedRound} firstMatchTime={teeSheetMatches[0]?.teeTime} />
        </section>}

        <div className="segmented golf-section-switch" role="tablist" aria-label="Selected round details">
          {golfSections.map((item) => <button type="button" role="tab" aria-selected={section === item.value} key={item.value} className={section === item.value ? 'active' : ''} onClick={() => setSection(item.value)}>{item.label}{item.value === 'prizes' && selectedPrizes.length > 0 ? ` (${selectedPrizes.length})` : ''}</button>)}
        </div>

        {section === 'tee-sheet' && selectedRound && <GolfTeeTimes selectedRound={selectedRound} matches={teeSheetMatches} players={activeData.players} teams={activeData.tourTeams} participants={activeData.matchParticipants} />}
        {section === 'results' && selectedRound && <GolfResults selectedRound={selectedRound} matches={selectedRoundMatches} data={activeData} teams={activeData.tourTeams} />}
        {section === 'prizes' && selectedRound && <GolfPrizes selectedRound={selectedRound} prizes={selectedPrizes} players={activeData.players} teams={activeData.tourTeams} />}
        {section === 'teams' && <GolfTeams teams={activeData.tourTeams} members={activeData.tourTeamMembers} players={activeData.players} tourPlayers={activeData.tourPlayers} />}
      </>}
    </>}
  </div>;
}

function GolfTeeTimes({ selectedRound, matches, players, teams, participants }: { selectedRound: Round; matches: Match[]; players: Player[]; teams: TourTeam[]; participants: MatchParticipant[] }) {
  return <section className="card tee-sheet-card">
    <div className="section-heading"><div><p className="eyebrow">Tee sheet</p><h3>{formatRoundDisplayName(selectedRound)}</h3></div><span>{matches.length} match{matches.length === 1 ? '' : 'es'}</span></div>
    {matches.length === 0 ? <p>Pairings and tee times will appear once published.</p> : <div className="tee-sheet-list">{matches.map((match) => <TeeSheetRow key={match.id} match={match} participants={participants.filter((participant) => participant.matchId === match.id)} players={players} teams={teams} />)}</div>}
  </section>;
}

function GolfResults({ selectedRound, matches, data, teams }: { selectedRound: Round; matches: Match[]; data: Omit<PublicMatchesResponse, 'source'>; teams: TourTeam[] }) {
  const score = roundTeamScore(matches);
  return <section className="tour-detail-section card round-results-panel">
    <div className="section-heading"><div><p className="eyebrow">Round results</p><h3>{formatRoundDisplayName(selectedRound)}</h3></div>{score && <strong className="round-result-score">{score}</strong>}</div>
    {matches.length === 0 ? <p>No results yet.</p> : <div className="round-match-list">{matches.map((match) => <MatchCard key={match.id} match={match} participants={data.matchParticipants.filter((participant) => participant.matchId === match.id)} players={data.players} teams={teams} />)}</div>}
  </section>;
}

function GolfPrizes({ selectedRound, prizes, players, teams }: { selectedRound: Round; prizes: RoundPrizeResult[]; players: Player[]; teams: TourTeam[] }) {
  return <section className="tour-detail-section card round-prizes-panel">
    <div className="section-heading"><div><p className="eyebrow">Secondary prizes</p><h3>{formatRoundDisplayName(selectedRound)}</h3></div></div>
    {prizes.length === 0 ? <p>Prize details and winners will appear here once published.</p> : <div className="round-prize-list">{prizes.map((prize) => {
      const winner = players.find((player) => player.id === prize.winnerPlayerId)?.displayName ?? teams.find((team) => team.id === prize.winnerTeamId)?.name ?? 'Winner TBC';
      const score = prize.winningScoreText ?? [prize.scoreValue, prize.scoreUnit].filter(Boolean).join(' ');
      return <article key={prize.id}><span>Prize</span><h4>{prize.title}</h4><strong>{winner}</strong>{score && <small>{score}</small>}</article>;
    })}</div>}
  </section>;
}

function GolfTeams({ teams, members, players, tourPlayers }: { teams: TourTeam[]; members: TourTeamMember[]; players: Player[]; tourPlayers: TourPlayer[] }) {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const tourPlayerById = new Map(tourPlayers.map((tourPlayer) => [tourPlayer.playerId, tourPlayer]));
  const orderedTeams = [...teams].sort((a, b) => a.sortOrder - b.sortOrder);

  return <section className="golf-teams-panel">
    <div className="section-heading"><div><p className="eyebrow">Tour squads</p><h2>Teams & players</h2></div><a className="text-link" href="/teams">Player profiles ›</a></div>
    {orderedTeams.length === 0 ? <p className="card">Teams will appear once the published squads are ready.</p> : <div className="team-card-grid golf-team-card-grid">{orderedTeams.map((team, index) => {
      const teamMembers = members.filter((member) => member.teamId === team.id).map((member) => {
        const player = playerById.get(member.playerId);
        const tourPlayer = tourPlayerById.get(member.playerId);
        return player ? { player, tourPlayer } : undefined;
      }).filter((entry): entry is { player: Player; tourPlayer: TourPlayer | undefined } => Boolean(entry));
      const captain = team.captainPlayerId ? playerById.get(team.captainPlayerId) : undefined;
      return <article className="team-display-card card golf-team-card" key={team.id} style={{ '--team-colour': normalizeTeamColour(team.colour, index) } as CSSProperties}>
        <div className="team-card-topline"><span className="team-dot" /><p className="eyebrow">Team</p></div>
        <h3>{team.name}</h3>
        {captain && <div className="captain-strip"><span>Captain</span><strong>{captain.displayName}</strong></div>}
        <div className="team-member-list">{teamMembers.length === 0 ? <p>Players TBC</p> : teamMembers.map(({ player, tourPlayer }) => <div className="team-member-row golf-team-member" key={player.id}>
          <span className="avatar small">{player.initials ?? player.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span>
          <span><strong>{tourPlayer?.nickname || player.nickname || player.displayName}</strong>{(tourPlayer?.nickname || player.nickname) && <small>{player.displayName}</small>}</span>
          {tourPlayer?.tourHandicap !== undefined && <b>{tourPlayer.tourHandicap}</b>}
        </div>)}</div>
      </article>;
    })}</div>}
  </section>;
}

function RoundMeta({ selectedRound, firstMatchTime }: { selectedRound: Round; firstMatchTime?: string }) {
  return <div className="selected-round-facts">
    <span><small>Date</small><strong>{formatShortDate(selectedRound.roundDate)}</strong></span>
    <span><small>Holes</small><strong>{selectedRound.holes ?? 18}</strong></span>
    <span><small>Session</small><strong>{roundSession(selectedRound) ?? 'TBC'}</strong></span>
    <span><small>First tee</small><strong>{formatTeeTimeDisplay(firstMatchTime ?? selectedRound.teeTime)}</strong></span>
  </div>;
}

function TeeSheetRow({ match, participants, players, teams }: { match: Match; participants: MatchParticipant[]; players: Player[]; teams: TourTeam[] }) {
  const sideATeam = teams.find((team) => team.id === match.sideATeamId);
  const sideBTeam = teams.find((team) => team.id === match.sideBTeamId);
  return <article className="tee-sheet-row" style={{ '--team-colour': normalizeTeamColour(sideATeam?.colour, 0), '--team-colour-right': normalizeTeamColour(sideBTeam?.colour, 1) } as CSSProperties}>
    <div className="tee-sheet-time"><strong>{formatTeeTimeDisplay(match.teeTime)}</strong><span>Match {match.matchNumber} · {formatMatchFormat(match.format)}</span></div>
    <div className="tee-sheet-pairing"><p>{pairingText(match, participants, players, teams)}</p><div className="tee-team-chips"><i style={{ '--team-colour': normalizeTeamColour(sideATeam?.colour, 0) } as CSSProperties}>{sideATeam?.name ?? 'Team 1 TBC'}</i><i style={{ '--team-colour': normalizeTeamColour(sideBTeam?.colour, 1) } as CSSProperties}>{sideBTeam?.name ?? 'Team 2 TBC'}</i></div></div>
  </article>;
}
