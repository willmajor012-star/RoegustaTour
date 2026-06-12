import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { deleteMatch, deleteRound, deleteTeam, deleteTour, fetchAdminData, saveBetMarket, updateBet, saveMatch, savePlayer, saveRound, saveTour, saveTourPlayer, saveTourTeam, saveTourTeamMembers, type AdminDataResponse } from '../lib/adminApi';
import { checkStoredAdminSession, clearStoredAdminSession, getStoredAdminSession, loginWithAdminPin, storeAdminSession, type StoredAdminSession } from '../lib/adminSession';
import { formatDate } from '../lib/formatting';
import type { Bet, BetMarket, BetOption, Match, MatchFormat, Player, Round, Tour, TourTeam } from '../lib/types';

const tabs = ['Overview', 'Tour setup', 'Player library', 'Squads & teams', 'Rounds & tee times', 'Matches & pairings', 'Bet Punto', 'Coming next'] as const;
type AdminTab = typeof tabs[number];
type SaveState = { saving: boolean; error?: string; success?: string };

type PlayerForm = { id?: string; displayName: string; nickname: string; initials: string; active: boolean };
type TourForm = { id?: string; name: string; year: string; location: string; startDate: string; endDate: string; status: Tour['status']; description: string };
type AttendanceDraft = { attending: boolean; tourHandicap: string; notes: string; teamId: string };
type TeamForm = { id?: string; name: string; colour: string; captainPlayerId: string; sortOrder: string };
type RoundForm = { id?: string; roundNumber: string; name: string; roundDate: string; session: 'AM' | 'PM' | 'TBC'; courseName: string; teeTime: string; format: MatchFormat; notes: string; status: Round['status'] };
type RoundPlanForm = { count: string; namePrefix: string; courseName: string; format: MatchFormat; status: Round['status'] };
type MatchForm = { id?: string; roundId: string; matchNumber: string; format: MatchFormat; status: Match['status']; sideATeamId: string; sideBTeamId: string; sideALabel: string; sideBLabel: string; pointsAvailable: string; pointsSideA: string; pointsSideB: string; resultText: string; teeTime: string; published: boolean; notes: string; sideAPlayerIds: string[]; sideBPlayerIds: string[] };
type BetOptionForm = { id?: string; label: string; linkedPlayerId: string; linkedTeamId: string; linkedMatchSide: '' | 'A' | 'B' | 'halved'; oddsDecimal: string; sortOrder: string };
type BetMarketForm = { id?: string; title: string; description: string; marketType: BetMarket['marketType']; marketScope: BetMarket['marketScope']; status: BetMarket['status']; roundId: string; matchId: string; closesAt: string; resultOptionId: string; resultText: string; options: BetOptionForm[] };

const emptyPlayerForm: PlayerForm = { displayName: '', nickname: '', initials: '', active: true };
const emptyTeamForm: TeamForm = { name: '', colour: '', captainPlayerId: '', sortOrder: '1' };
const emptyBetOptionForm = (sortOrder = 1): BetOptionForm => ({ label: '', linkedPlayerId: '', linkedTeamId: '', linkedMatchSide: '', oddsDecimal: '', sortOrder: String(sortOrder) });
const roundCountOptions = Array.from({ length: 8 }, (_, index) => index + 1);
const roundSessionOptions: RoundForm['session'][] = ['TBC', 'AM', 'PM'];
const emptyRoundPlanForm: RoundPlanForm = { count: '1', namePrefix: 'Round', courseName: '', format: 'singles', status: 'planned' };
const scrollAdminPanelTop = () => window.setTimeout(() => document.querySelector('.admin-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
const emptyBetMarketForm: BetMarketForm = { title: '', description: '', marketType: 'custom', marketScope: 'general_pot', status: 'open', roundId: '', matchId: '', closesAt: '', resultOptionId: '', resultText: '', options: [emptyBetOptionForm(1), emptyBetOptionForm(2)] };
const formatOptions: { value: MatchFormat; label: string }[] = [
  { value: 'singles', label: 'Singles' },
  { value: 'better_ball', label: 'Better ball' },
  { value: 'foursomes', label: 'Foursomes' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'custom', label: 'Custom' },
];
const formatByLabel = new Map(formatOptions.map((option) => [option.label.toLowerCase(), option.value]));

function emptyTourForm(tour?: Tour): TourForm {
  return { id: tour?.id, name: tour?.name ?? '', year: tour?.year ? String(tour.year) : '', location: tour?.location ?? '', startDate: tour?.startDate ?? '', endDate: tour?.endDate ?? '', status: tour?.status ?? 'planned', description: tour?.description ?? '' };
}

function splitRoundNotes(notes?: string): { session: RoundForm['session']; notes: string } {
  const rawNotes = notes ?? '';
  const match = rawNotes.match(/^\[Session: (AM|PM|TBC)\]\n?/);
  return { session: (match?.[1] as RoundForm['session'] | undefined) ?? 'TBC', notes: match ? rawNotes.slice(match[0].length) : rawNotes };
}

function combineRoundNotes(session: RoundForm['session'], notes: string): string | null {
  const trimmedNotes = notes.trim();
  const sessionPrefix = `[Session: ${session}]`;
  return trimmedNotes ? `${sessionPrefix}\n${trimmedNotes}` : sessionPrefix;
}

function emptyRoundForm(round?: Round): RoundForm {
  const noteParts = splitRoundNotes(round?.notes);
  return { id: round?.id, roundNumber: round?.roundNumber ? String(round.roundNumber) : '1', name: round?.name ?? 'Round 1', roundDate: round?.roundDate ?? '', session: noteParts.session, courseName: round?.courseName ?? '', teeTime: round?.teeTime ?? '', format: formatByLabel.get((round?.formatLabel ?? '').toLowerCase()) ?? 'singles', notes: noteParts.notes, status: round?.status ?? 'draft' };
}

function emptyMatchForm(round?: Round, match?: Match): MatchForm {
  const defaultFormat = formatByLabel.get((round?.formatLabel ?? '').toLowerCase()) ?? 'singles';
  return { id: match?.id, roundId: match?.roundId ?? round?.id ?? '', matchNumber: match?.matchNumber ? String(match.matchNumber) : '1', format: match?.format ?? defaultFormat, status: match?.status ?? 'draft', sideATeamId: match?.sideATeamId ?? '', sideBTeamId: match?.sideBTeamId ?? '', sideALabel: match?.sideALabel ?? '', sideBLabel: match?.sideBLabel ?? '', pointsAvailable: match?.pointsAvailable ? String(match.pointsAvailable) : '1', pointsSideA: match?.pointsSideA === undefined ? '' : String(match.pointsSideA), pointsSideB: match?.pointsSideB === undefined ? '' : String(match.pointsSideB), resultText: match?.resultText ?? '', teeTime: match?.teeTime ?? '', published: match?.published ?? false, notes: match?.notes ?? '', sideAPlayerIds: [], sideBPlayerIds: [] };
}

function playerLabel(player?: Player): string {
  if (!player) return 'Unknown player';
  return player.nickname ? `${player.displayName} (${player.nickname})` : player.displayName;
}

export function Admin() {
  const [storedSession, setStoredSession] = useState<StoredAdminSession | null>(null);
  const [actorLabel, setActorLabel] = useState(() => getStoredAdminSession()?.session.actorLabel ?? '');
  const [pin, setPin] = useState('');
  const [loginState, setLoginState] = useState<'idle' | 'submitting'>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('Overview');

  const [adminData, setAdminData] = useState<AdminDataResponse | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | undefined>();
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [playerForm, setPlayerForm] = useState<PlayerForm>(emptyPlayerForm);
  const [tourForm, setTourForm] = useState<TourForm>(emptyTourForm());
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [roundForm, setRoundForm] = useState<RoundForm>(emptyRoundForm());
  const [roundPlanForm, setRoundPlanForm] = useState<RoundPlanForm>(emptyRoundPlanForm);
  const [matchForm, setMatchForm] = useState<MatchForm>(emptyMatchForm());
  const [betMarketForm, setBetMarketForm] = useState<BetMarketForm>(emptyBetMarketForm);
  const [states, setStates] = useState<Record<string, SaveState>>({});

  const loadAdminData = async (tourId = selectedTourId) => {
    setDataLoading(true);
    setDataError(null);
    try {
      const nextData = await fetchAdminData(tourId);
      setAdminData(nextData);
      const selected = nextData.selectedTour ?? nextData.currentTour;
      setSelectedTourId(selected?.id);
      setTourForm(emptyTourForm(selected));
      const memberByPlayer = new Map(nextData.tourTeamMembers.map((member) => [member.playerId, member.teamId]));
      setAttendanceDrafts(Object.fromEntries(nextData.players.map((player) => {
        const tourPlayer = nextData.tourPlayers.find((row) => row.playerId === player.id);
        return [player.id, { attending: tourPlayer?.attending ?? false, tourHandicap: tourPlayer?.tourHandicap === undefined ? '' : String(tourPlayer.tourHandicap), notes: tourPlayer?.notes ?? '', teamId: memberByPlayer.get(player.id) ?? '' }];
      })));
      const selectedRoundForEditor = nextData.rounds.find((round) => round.id === roundForm.id) ?? nextData.rounds[0];
      setRoundForm(emptyRoundForm(selectedRoundForEditor));
      setRoundPlanForm({ ...emptyRoundPlanForm, count: String(Math.min(Math.max(nextData.rounds.length || 1, 1), 8)), courseName: selected?.location ?? '' });
      const selectedMatchForEditor = nextData.matches.find((match) => match.id === matchForm.id);
      const selectedRoundForMatch = nextData.rounds.find((round) => round.id === (selectedMatchForEditor?.roundId ?? matchForm.roundId)) ?? selectedRoundForEditor ?? nextData.rounds[0];
      const selectedMatchParticipants = selectedMatchForEditor ? nextData.matchParticipants.filter((participant) => participant.matchId === selectedMatchForEditor.id) : [];
      setMatchForm({
        ...emptyMatchForm(selectedRoundForMatch, selectedMatchForEditor),
        sideAPlayerIds: selectedMatchParticipants.filter((participant) => participant.side === 'A').map((participant) => participant.playerId),
        sideBPlayerIds: selectedMatchParticipants.filter((participant) => participant.side === 'B').map((participant) => participant.playerId),
      });
    } catch (error) {
      setDataError('Admin data could not be loaded. Please refresh or sign in again.');
      if (error instanceof Error && error.message === 'Please sign in again.') setStoredSession(null);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;
    checkStoredAdminSession().then((checkedSession) => {
      if (!isCurrent) return;
      setStoredSession(checkedSession);
      if (checkedSession) setActorLabel(checkedSession.session.actorLabel);
    });
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => { if (storedSession) void loadAdminData(); }, [storedSession]);

  const selectedTour = adminData?.selectedTour ?? adminData?.currentTour;
  const playersById = useMemo(() => new Map((adminData?.players ?? []).map((player) => [player.id, player])), [adminData]);
  const teamsById = useMemo(() => new Map((adminData?.tourTeams ?? []).map((team) => [team.id, team])), [adminData]);
  const activePlayers = (adminData?.players ?? []).filter((player) => player.active);
  const inactivePlayers = (adminData?.players ?? []).filter((player) => !player.active);
  const tourPlayers = adminData?.tourPlayers ?? [];
  const attendingPlayerIds = new Set(tourPlayers.filter((row) => row.attending).map((row) => row.playerId));
  const assignedPlayerIds = new Set((adminData?.tourTeamMembers ?? []).map((member) => member.playerId));
  const attendingUnassigned = activePlayers.filter((player) => attendingPlayerIds.has(player.id) && !assignedPlayerIds.has(player.id));
  const notAttending = activePlayers.filter((player) => !attendingPlayerIds.has(player.id));
  const selectedRound = (adminData?.rounds ?? []).find((round) => round.id === roundForm.id) ?? adminData?.rounds[0];
  const selectedMatchRound = (adminData?.rounds ?? []).find((round) => round.id === matchForm.roundId) ?? adminData?.rounds[0];
  const roundMatches = (adminData?.matches ?? []).filter((match) => match.roundId === matchForm.roundId);
  const draftMatches = (adminData?.matches ?? []).filter((match) => !match.published && match.status !== 'complete').length;
  const publishedMatches = (adminData?.matches ?? []).filter((match) => match.published).length;
  const completeMatches = (adminData?.matches ?? []).filter((match) => match.status === 'complete').length;
  const selectedRoundMatchCount = (adminData?.matches ?? []).filter((match) => match.roundId === roundForm.id).length;
  const selectedBetMarket = (adminData?.betMarkets ?? []).find((market) => market.id === betMarketForm.id);
  const selectedBetMarketBets = selectedBetMarket ? (adminData?.bets ?? []).filter((bet) => bet.marketId === selectedBetMarket.id) : [];
  const selectedBetMarketOptions = selectedBetMarket ? (adminData?.betOptions ?? []).filter((option) => option.marketId === selectedBetMarket.id) : [];

  const setSaveState = (key: string, state: SaveState) => setStates((current) => ({ ...current, [key]: state }));
  const runSave = async (key: string, success: string, action: () => Promise<string | void>) => {
    setSaveState(key, { saving: true });
    try {
      const nextTourId = await action();
      await loadAdminData(nextTourId || selectedTourId);
      setSaveState(key, { saving: false, success });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed.';
      if (message === 'Please sign in again.') setStoredSession(null);
      setSaveState(key, { saving: false, error: message });
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginState('submitting');
    setLoginError(null);
    try {
      const nextSession = await loginWithAdminPin(pin, actorLabel);
      storeAdminSession(nextSession);
      setStoredSession(nextSession);
      setActorLabel(nextSession.session.actorLabel);
      setPin('');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to create an admin session.');
    } finally {
      setLoginState('idle');
    }
  };

  const handleLogout = () => { clearStoredAdminSession(); setStoredSession(null); setAdminData(null); };
  const submitPlayer = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runSave('player', 'Player saved.', async () => { await savePlayer(playerForm); setPlayerForm(emptyPlayerForm); }); };
  const submitTour = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runSave('tour', 'Tour saved.', async () => { const saved = await saveTour({ ...tourForm, year: Number(tourForm.year) }); setSelectedTourId(saved.tour.id); return saved.tour.id; }); };
  const submitTeam = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('team', 'Team saved.', async () => { await saveTourTeam({ ...teamForm, tourId: selectedTour.id, captainPlayerId: teamForm.captainPlayerId || null, sortOrder: Number(teamForm.sortOrder) }); setTeamForm(emptyTeamForm); }); };
  const submitRound = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('round', 'Round saved.', async () => { await saveRound({ ...roundForm, tourId: selectedTour.id, roundNumber: Number(roundForm.roundNumber), roundDate: roundForm.roundDate || null, courseName: roundForm.courseName || null, teeTime: roundForm.teeTime || null, notes: combineRoundNotes(roundForm.session, roundForm.notes) }); return selectedTour.id; }); };
  const submitMatch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('match', 'Match saved.', async () => { await saveMatch({ ...matchForm, tourId: selectedTour.id, matchNumber: Number(matchForm.matchNumber), pointsAvailable: Number(matchForm.pointsAvailable), pointsSideA: matchForm.pointsSideA === '' ? null : Number(matchForm.pointsSideA), pointsSideB: matchForm.pointsSideB === '' ? null : Number(matchForm.pointsSideB), resultText: matchForm.resultText || null, teeTime: matchForm.teeTime || null, sideALabel: matchForm.sideALabel || null, sideBLabel: matchForm.sideBLabel || null, notes: matchForm.notes || null }); }); };

  const saveSquadPlayer = (playerId: string) => {
    if (!selectedTour) return;
    const draft = attendanceDrafts[playerId];
    void runSave(`squad-${playerId}`, 'Player squad saved.', async () => {
      const handicap = draft.tourHandicap.trim() === '' ? null : Number(draft.tourHandicap);
      if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 54)) throw new Error('Handicap must be blank or between -10 and 54.');
      await saveTourPlayer({ tourId: selectedTour.id, playerId, attending: draft.attending, tourHandicap: handicap, notes: draft.notes });
      for (const team of adminData?.tourTeams ?? []) {
        const currentIds = (adminData?.tourTeamMembers ?? []).filter((member) => member.teamId === team.id).map((member) => member.playerId).filter((id) => id !== playerId);
        const playerIds = draft.attending && draft.teamId === team.id ? [...currentIds, playerId] : currentIds;
        await saveTourTeamMembers({ tourId: selectedTour.id, teamId: team.id, playerIds });
      }
    });
  };

  const planRounds = () => {
    if (!selectedTour) return;
    const count = Number(roundPlanForm.count);
    if (!Number.isInteger(count) || count < 1 || count > 8) {
      setSaveState('plan-rounds', { saving: false, error: 'Choose between 1 and 8 rounds.' });
      return;
    }
    const surplusRounds = (adminData?.rounds ?? []).filter((round) => round.roundNumber > count);
    const protectedSurplus = surplusRounds.filter((round) => (adminData?.matches ?? []).some((match) => match.roundId === round.id) || (adminData?.betMarkets ?? []).some((market) => market.roundId === round.id && market.status !== 'void'));
    if (protectedSurplus.length > 0) {
      setSaveState('plan-rounds', { saving: false, error: `Round count set to ${count}. ${protectedSurplus.map((round) => round.name).join(', ')} cannot be removed automatically because protected match or Bet Punto data exists. Use each round card's Delete button for safe surplus rounds.` });
      return;
    }
    if (surplusRounds.length > 0) {
      setSaveState('plan-rounds', { saving: false, error: `Round count set to ${count}. Surplus rounds are not deleted automatically. Use each safe round card's Delete button if you want to remove ${surplusRounds.map((round) => round.name).join(', ')}.` });
      return;
    }
    void runSave('plan-rounds', 'Round setup saved.', async () => {
      for (let index = 0; index < count; index += 1) {
        const roundNumber = index + 1;
        const existing = adminData?.rounds.find((round) => round.roundNumber === roundNumber);
        if (existing) continue;
        await saveRound({
          tourId: selectedTour.id,
          roundNumber,
          name: `${roundPlanForm.namePrefix || 'Round'} ${roundNumber}`,
          status: roundPlanForm.status,
          format: roundPlanForm.format,
          roundDate: null,
          courseName: roundPlanForm.courseName || null,
          teeTime: null,
          notes: combineRoundNotes('TBC', ''),
        });
      }
      return selectedTour.id;
    });
  };

  const removeSelectedTour = () => {
    if (!tourForm.id) return;
    if (!window.confirm(`Delete ${tourForm.name || 'this tour'}? This is only allowed for test tours with no completed results.`)) return;
    void runSave('delete-tour', 'Tour deleted.', async () => { await deleteTour({ id: tourForm.id as string }); setTourForm(emptyTourForm()); return undefined; });
  };

  const removeRound = (round = selectedRound) => {
    if (!selectedTour || !round?.id) return;
    if (!window.confirm(`Delete ${round.name || 'this round'}? This is only allowed for safe draft/planned rounds with no protected data.`)) return;
    void runSave('delete-round', 'Round deleted.', async () => { await deleteRound({ id: round.id, tourId: selectedTour.id }); setRoundForm(emptyRoundForm()); return selectedTour.id; });
  };

  const removeTeam = (team: TourTeam) => {
    if (!selectedTour) return;
    if (!window.confirm(`Delete unused team ${team.name}? This cannot be undone.`)) return;
    void runSave(`delete-team-${team.id}`, 'Team deleted.', async () => { await deleteTeam({ id: team.id, tourId: selectedTour.id }); if (teamForm.id === team.id) setTeamForm(emptyTeamForm); return selectedTour.id; });
  };

  const removeMatch = (match: Match) => {
    if (!selectedTour) return;
    if (!window.confirm(`Delete draft match ${match.matchNumber}? This cannot be undone.`)) return;
    void runSave(`delete-match-${match.id}`, 'Match deleted.', async () => { await deleteMatch({ id: match.id, tourId: selectedTour.id }); if (matchForm.id === match.id) setMatchForm(emptyMatchForm(selectedMatchRound)); return selectedTour.id; });
  };

  const toggleMatchPlayer = (side: 'A' | 'B', playerId: string) => setMatchForm((current) => {
    const ownKey = side === 'A' ? 'sideAPlayerIds' : 'sideBPlayerIds';
    const otherKey = side === 'A' ? 'sideBPlayerIds' : 'sideAPlayerIds';
    const own = current[ownKey].includes(playerId) ? current[ownKey].filter((id) => id !== playerId) : [...current[ownKey], playerId];
    return { ...current, [ownKey]: own, [otherKey]: current[otherKey].filter((id) => id !== playerId) };
  });


  const betFormFromMarket = (market: BetMarket): BetMarketForm => {
    const options = (adminData?.betOptions ?? []).filter((option) => option.marketId === market.id).map((option) => ({ id: option.id, label: option.label, linkedPlayerId: option.linkedPlayerId ?? '', linkedTeamId: option.linkedTeamId ?? '', linkedMatchSide: (option.linkedMatchSide ?? '') as BetOptionForm['linkedMatchSide'], oddsDecimal: option.oddsDecimal === undefined ? '' : String(option.oddsDecimal), sortOrder: String(option.sortOrder) }));
    return { id: market.id, title: market.title, description: market.description ?? '', marketType: market.marketType, marketScope: market.marketScope, status: market.status, roundId: market.roundId ?? '', matchId: market.matchId ?? '', closesAt: market.closesAt ?? '', resultOptionId: market.resultOptionId ?? '', resultText: market.resultText ?? '', options: options.length > 0 ? options : [emptyBetOptionForm(1)] };
  };

  const roundBetLabel = (roundId: string) => {
    const round = adminData?.rounds.find((candidate) => candidate.id === roundId);
    if (!round) return 'tour';
    return `Round ${round.roundNumber}${round.roundDate ? ` (${formatDate(round.roundDate)})` : ''}`;
  };

  const replaceBetOptions = (nextForm: BetMarketForm) => {
    if (betMarketForm.id && !window.confirm("Replace this market's options? Options with logged bets cannot be removed by the backend.")) return;
    setBetMarketForm(nextForm);
  };

  const applyStablefordWinnerOptions = () => {
    const eligiblePlayers = activePlayers.filter((player) => attendingPlayerIds.has(player.id));
    if (eligiblePlayers.length === 0) {
      setSaveState('bet-market', { saving: false, error: 'Add attending players to this tour before building a Stableford winner market.' });
      return;
    }
    const titleRound = betMarketForm.roundId ? `${roundBetLabel(betMarketForm.roundId)} stableford winner` : 'Stableford winner';
    replaceBetOptions({
      ...betMarketForm,
      title: betMarketForm.title || titleRound,
      description: betMarketForm.description || 'Pick the player with the best Stableford score for this round/day.',
      marketType: 'player_performance',
      matchId: '',
      options: eligiblePlayers.map((player, index) => ({ ...emptyBetOptionForm(index + 1), label: playerLabel(player), linkedPlayerId: player.id })),
    });
  };

  const applyRoundTeamScoreOptions = (label: 'Scramble lowest score' | 'Better ball lowest score') => {
    if (!betMarketForm.roundId) {
      setSaveState('bet-market', { saving: false, error: 'Choose a round before building scramble or better ball team options.' });
      return;
    }
    const roundTeamIds = [...new Set((adminData?.matches ?? []).filter((match) => match.roundId === betMarketForm.roundId).flatMap((match) => [match.sideATeamId, match.sideBTeamId]).filter(Boolean))];
    if (roundTeamIds.length === 0) {
      setSaveState('bet-market', { saving: false, error: 'Add pairings/matches for this round before building team score options.' });
      return;
    }
    replaceBetOptions({
      ...betMarketForm,
      title: betMarketForm.title || `${roundBetLabel(betMarketForm.roundId)} ${label}`,
      description: betMarketForm.description || `Pick the team with the lowest ${label.toLowerCase().replace(' lowest score', '')} score for this round.`,
      marketType: 'team_result',
      matchId: '',
      options: roundTeamIds.map((teamId, index) => ({ ...emptyBetOptionForm(index + 1), label: teamsById.get(teamId)?.name ?? `Team ${index + 1}`, linkedTeamId: teamId })),
    });
  };

  const submitBetMarket = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('bet-market', 'Bet Punto market saved.', async () => { await saveBetMarket({ ...betMarketForm, tourId: selectedTour.id, roundId: betMarketForm.roundId || null, matchId: betMarketForm.matchId || null, closesAt: betMarketForm.closesAt || null, resultOptionId: betMarketForm.resultOptionId || null, resultText: betMarketForm.resultText || null, options: betMarketForm.options.map((option, index) => ({ id: option.id, label: option.label, linkedPlayerId: option.linkedPlayerId || null, linkedTeamId: option.linkedTeamId || null, linkedMatchSide: option.linkedMatchSide || null, oddsDecimal: option.oddsDecimal === '' ? null : Number(option.oddsDecimal), sortOrder: Number(option.sortOrder) || index + 1 })) }); setBetMarketForm(emptyBetMarketForm); }); };

  const updateBetStatus = (bet: Bet, nextStatus: Bet['status']) => { void runSave(`bet-${bet.id}`, 'Bet updated.', async () => { await updateBet({ id: bet.id, status: nextStatus, outcomeStatus: nextStatus === 'void' ? 'void' : (bet.outcomeStatus === 'void' ? 'pending' : bet.outcomeStatus), payoutStatus: nextStatus === 'void' ? 'not_applicable' : bet.payoutStatus, payoutAmountPence: nextStatus === 'void' ? null : (bet.payoutAmountPence ?? null), payoutNotes: bet.payoutNotes ?? null }); }); };

  const updateBetOutcome = (bet: Bet, outcomeStatus: Bet['outcomeStatus']) => { void runSave(`bet-${bet.id}`, 'Bet outcome updated.', async () => { await updateBet({ id: bet.id, status: outcomeStatus === 'void' ? 'void' : 'active', outcomeStatus, payoutStatus: outcomeStatus === 'won' ? 'unpaid' : 'not_applicable', payoutAmountPence: outcomeStatus === 'won' ? (bet.payoutAmountPence ?? null) : null, payoutNotes: bet.payoutNotes ?? null }); }); };

  const promptBetPayout = (bet: Bet) => {
    const amountText = window.prompt('Indicative payout in pounds (blank to clear)', bet.payoutAmountPence === undefined ? '' : String(bet.payoutAmountPence / 100));
    if (amountText === null) return;
    const notes = window.prompt('Payout notes (optional)', bet.payoutNotes ?? '');
    const trimmed = amountText.trim();
    const payoutAmountPence = trimmed === '' ? null : Math.round(Number(trimmed.replace(/^£/, '')) * 100);
    if (payoutAmountPence !== null && (!Number.isFinite(payoutAmountPence) || payoutAmountPence < 0)) {
      setSaveState(`bet-${bet.id}`, { saving: false, error: 'Payout must be blank or a zero-or-greater amount.' });
      return;
    }
    void runSave(`bet-${bet.id}`, 'Bet payout updated.', async () => { await updateBet({ id: bet.id, status: bet.status, outcomeStatus: bet.outcomeStatus, payoutStatus: payoutAmountPence && payoutAmountPence > 0 ? 'unpaid' : 'not_applicable', payoutAmountPence, payoutNotes: notes || null }); });
  };

  const expiresAtLabel = storedSession ? new Date(storedSession.session.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return <div className="page-stack admin-page">
    <section className="page-title"><p className="eyebrow">Live setup management</p><h2>Admin</h2><p>PIN-protected tools for live tour lifecycle, squads, rounds and draft/published pairings. Result entry, handicaps and Bet Punto tracking stay behind this admin session.</p></section>
    <section className="card admin-login-panel"><div><p className="eyebrow">Admin PIN session</p><h3>{storedSession ? 'Admin session active' : 'Sign in to unlock admin writes'}</h3><p>{storedSession ? `This browser has a short-lived admin session until ${expiresAtLabel}.` : 'Enter the shared admin PIN to create a short-lived browser session. The optional label is only for admin context, not a user account.'}</p></div>{storedSession ? <button className="admin-secondary-button" type="button" onClick={handleLogout}>Log out</button> : <form className="admin-login-form" onSubmit={handleLogin}><label>Admin label<input value={actorLabel} onChange={(event) => setActorLabel(event.target.value)} placeholder="Optional admin label" /></label><label>Shared PIN<input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" type="password" autoComplete="current-password" /></label>{loginError ? <p className="form-error">{loginError}</p> : null}<button type="submit" disabled={loginState === 'submitting'}>{loginState === 'submitting' ? 'Signing in…' : 'Create admin session'}</button></form>}</section>

    {storedSession ? <>
      <nav className="admin-section-nav" aria-label="Admin sections">{tabs.map((tab) => <button className={`pill ${activeTab === tab ? 'selected' : ''}`} type="button" onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</nav>
      {dataLoading ? <p className="card">Loading live admin data…</p> : null}
      {dataError ? <p className="card form-error">{dataError}</p> : null}
      {!dataLoading && !dataError && adminData ? <>
        {activeTab === 'Overview' ? <section className="card admin-panel"><p className="eyebrow">Overview</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{selectedTour ? <p>{selectedTour.location ?? 'Location TBC'} · {formatDate(selectedTour.startDate)} — {formatDate(selectedTour.endDate)} · {selectedTour.status}</p> : <p>No tour has been added yet.</p>}<div className="stat-grid"><Stat label="Active players" value={activePlayers.length} /><Stat label="Inactive players" value={inactivePlayers.length} /><Stat label="Attending" value={attendingPlayerIds.size} /><Stat label="Teams" value={adminData.tourTeams.length} /><Stat label="Assigned attending" value={assignedPlayerIds.size} /><Stat label="Attending unassigned" value={attendingUnassigned.length} /><Stat label="Rounds" value={adminData.rounds.length} /><Stat label="Draft matches" value={draftMatches} /><Stat label="Published matches" value={publishedMatches} /><Stat label="Complete matches" value={completeMatches} /></div></section> : null}

        {activeTab === 'Tour setup' ? <section className="card admin-panel"><p className="eyebrow">Tour lifecycle</p><h3>Edit or create annual tours</h3><p>Archiving or completing a tour does not delete historic matches, results or stats.</p><div className="chip-list">{adminData.tours.map((tour) => <button className={`pill ${selectedTour?.id === tour.id ? 'selected' : ''}`} type="button" key={tour.id} onClick={() => void loadAdminData(tour.id)}>{tour.name} · {tour.status}</button>)}</div><div className="chip-list"><button className="pill" type="button" onClick={() => setTourForm(emptyTourForm())}>Create new tour</button><button className="pill" type="button" onClick={() => { const nextYear = Math.max(new Date().getFullYear(), ...adminData.tours.map((tour) => tour.year)) + 1; setTourForm({ name: `Roegusta Tour ${nextYear}`, year: String(nextYear), status: 'planned', location: '', startDate: '', endDate: '', description: '' }); }}>Create next tour</button></div><form className="admin-form-grid" onSubmit={submitTour}><label>Name<input value={tourForm.name} onChange={(event) => setTourForm({ ...tourForm, name: event.target.value })} /></label><label>Year<input value={tourForm.year} onChange={(event) => setTourForm({ ...tourForm, year: event.target.value })} inputMode="numeric" /></label><label>Location<input value={tourForm.location} onChange={(event) => setTourForm({ ...tourForm, location: event.target.value })} /></label><label>Start date<input value={tourForm.startDate} onChange={(event) => setTourForm({ ...tourForm, startDate: event.target.value })} type="date" /></label><label>End date<input value={tourForm.endDate} onChange={(event) => setTourForm({ ...tourForm, endDate: event.target.value })} type="date" /></label><label>Status<select value={tourForm.status} onChange={(event) => setTourForm({ ...tourForm, status: event.target.value as Tour['status'] })}><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label><label className="admin-full-span">Description<textarea value={tourForm.description} onChange={(event) => setTourForm({ ...tourForm, description: event.target.value })} /></label><SaveButton state={states.tour} label={tourForm.id ? 'Save tour' : 'Create tour'} />{tourForm.id ? <SaveButton state={states['delete-tour']} label="Delete test tour" onClick={removeSelectedTour} /> : null}</form></section> : null}

        {activeTab === 'Player library' ? <section className="card admin-panel"><p className="eyebrow">Player library</p><h3>Permanent players</h3><form className="admin-form-grid" onSubmit={submitPlayer}><label>Display name<input value={playerForm.displayName} onChange={(event) => setPlayerForm({ ...playerForm, displayName: event.target.value })} /></label><label>Nickname<input value={playerForm.nickname} onChange={(event) => setPlayerForm({ ...playerForm, nickname: event.target.value })} /></label><label>Initials<input value={playerForm.initials} onChange={(event) => setPlayerForm({ ...playerForm, initials: event.target.value })} /></label><label>Active<select value={playerForm.active ? 'yes' : 'no'} onChange={(event) => setPlayerForm({ ...playerForm, active: event.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></label><SaveButton state={states.player} label={playerForm.id ? 'Save player' : 'Create player'} /></form><div className="admin-card-list">{adminData.players.map((player) => <article className="admin-mini-card" key={player.id}><div><strong>{player.displayName}</strong><span>{player.active ? 'Active' : 'Inactive'}{player.initials ? ` · ${player.initials}` : ''}{player.nickname ? ` · ${player.nickname}` : ''}</span></div><button type="button" onClick={() => setPlayerForm({ id: player.id, displayName: player.displayName, nickname: player.nickname ?? '', initials: player.initials ?? '', active: player.active })}>Edit</button></article>)}</div></section> : null}

        {activeTab === 'Squads & teams' ? <section className="card admin-panel"><p className="eyebrow">Squads & teams</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{!selectedTour ? <p>No tour is available.</p> : <><form className="admin-form-grid" onSubmit={submitTeam}>{teamForm.id ? <p className="admin-full-span form-success">Editing team: {teamForm.name}</p> : null}<label>Team name<input value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></label><label>Colour<input value={teamForm.colour} onChange={(event) => setTeamForm({ ...teamForm, colour: event.target.value })} /></label><label>Captain<select value={teamForm.captainPlayerId} onChange={(event) => setTeamForm({ ...teamForm, captainPlayerId: event.target.value })}><option value="">No captain</option>{activePlayers.map((player) => <option value={player.id} key={player.id}>{playerLabel(player)}</option>)}</select></label><label>Sort order<input value={teamForm.sortOrder} onChange={(event) => setTeamForm({ ...teamForm, sortOrder: event.target.value })} inputMode="numeric" /></label><SaveButton state={states.team} label={teamForm.id ? 'Save team' : 'Create team'} />{teamForm.id ? <button type="button" onClick={() => setTeamForm(emptyTeamForm)}>Cancel team edit</button> : null}</form><div className="admin-status-groups"><StatusGroup title="Attending but unassigned" players={attendingUnassigned} /><StatusGroup title="Not attending" players={notAttending} /></div><div className="admin-card-list">{activePlayers.map((player) => { const draft = attendanceDrafts[player.id] ?? { attending: false, tourHandicap: '', notes: '', teamId: '' }; return <article className="admin-mini-card attendance-card" key={player.id}><div><strong>{playerLabel(player)}</strong><label className="publish-toggle"><input type="checkbox" checked={draft.attending} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, attending: event.target.checked, teamId: event.target.checked ? draft.teamId : '' } })} /> Attending</label></div><label>Tour handicap<input value={draft.tourHandicap} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, tourHandicap: event.target.value } })} inputMode="decimal" /></label><label>Team<select value={draft.teamId} disabled={!draft.attending} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, teamId: event.target.value } })}><option value="">Unassigned</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Notes<input value={draft.notes} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, notes: event.target.value } })} /></label><SaveButton state={states[`squad-${player.id}`]} label="Save player" onClick={() => saveSquadPlayer(player.id)} /></article>; })}</div><details><summary>Inactive players</summary><div className="chip-list">{inactivePlayers.length === 0 ? <span className="pill">None</span> : inactivePlayers.map((player) => <span className="pill" key={player.id}>{playerLabel(player)}</span>)}</div></details><div className="admin-card-list">{adminData.tourTeams.map((team) => <article className="admin-mini-card team-card" key={team.id}><div><strong>{team.name}</strong><span>{team.colour ?? 'Colour TBC'} · Sort {team.sortOrder}{team.captainPlayerId ? ` · Captain ${playerLabel(playersById.get(team.captainPlayerId))}` : ''}</span><div className="chip-list">{adminData.tourTeamMembers.filter((member) => member.teamId === team.id).map((member) => <span className="pill" key={member.id}>{playerLabel(playersById.get(member.playerId))}</span>)}</div></div><button type="button" onClick={() => { setTeamForm({ id: team.id, name: team.name, colour: team.colour ?? '', captainPlayerId: team.captainPlayerId ?? '', sortOrder: String(team.sortOrder) }); scrollAdminPanelTop(); }}>Edit team</button><button type="button" onClick={() => removeTeam(team)}>Delete unused team</button>{states[`delete-team-${team.id}`]?.error ? <span className="form-error">{states[`delete-team-${team.id}`]?.error}</span> : null}</article>)}</div></>}</section> : null}

        {activeTab === 'Rounds & tee times' ? <section className="card admin-panel"><p className="eyebrow">Rounds & tee times</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{!selectedTour ? <p>No tour is available.</p> : <><div className="chip-list"><button className="pill" type="button" onClick={() => setRoundForm({ ...emptyRoundForm({ id: '', tourId: selectedTour.id, roundNumber: adminData.rounds.length + 1, name: `Round ${adminData.rounds.length + 1}`, status: 'draft' }), id: undefined })}>New round</button></div><div className="premium-inset"><p className="eyebrow">Tour round setup</p><div className="admin-form-grid"><label>Number of rounds<select value={roundPlanForm.count} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, count: event.target.value })}>{roundCountOptions.map((count) => <option value={count} key={count}>{count}</option>)}</select></label><label>Name prefix<input value={roundPlanForm.namePrefix} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, namePrefix: event.target.value })} /></label><label>Default course<input value={roundPlanForm.courseName} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, courseName: event.target.value })} /></label><label>Default format<select value={roundPlanForm.format} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, format: event.target.value as MatchFormat })}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Status<select value={roundPlanForm.status} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, status: event.target.value as Round['status'] })}><option value="draft">Draft</option><option value="planned">Planned</option><option value="active">Active</option></select></label><SaveButton state={states['plan-rounds']} label="Save round setup" onClick={planRounds} /></div><small>Increasing the count creates missing round rows only. Existing dates, courses, formats, tee times, statuses and notes are preserved. Reducing the count never deletes rounds automatically; use safe Delete buttons on surplus draft/planned rounds.</small></div><label>Edit round<select value={roundForm.id ?? ''} onChange={(event) => { const round = adminData.rounds.find((candidate) => candidate.id === event.target.value); setRoundForm(emptyRoundForm(round)); }}><option value="">New unsaved round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>Round {round.roundNumber}: {round.name}{round.roundDate ? ` · ${formatDate(round.roundDate)}` : ''}</option>)}</select></label><form className="admin-form-grid" onSubmit={submitRound}><label>Round number<input value={roundForm.roundNumber} onChange={(event) => setRoundForm({ ...roundForm, roundNumber: event.target.value })} inputMode="numeric" /></label><label>Name<input value={roundForm.name} onChange={(event) => setRoundForm({ ...roundForm, name: event.target.value })} /></label><label>Date<input value={roundForm.roundDate} onChange={(event) => setRoundForm({ ...roundForm, roundDate: event.target.value })} type="date" /></label><label>Day/session<select value={roundForm.session} onChange={(event) => setRoundForm({ ...roundForm, session: event.target.value as RoundForm['session'] })}>{roundSessionOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label><label>Exact tee time<input value={roundForm.teeTime} onChange={(event) => setRoundForm({ ...roundForm, teeTime: event.target.value })} type="time" /></label><label>Course<input value={roundForm.courseName} onChange={(event) => setRoundForm({ ...roundForm, courseName: event.target.value })} /></label><label>Format<select value={roundForm.format} onChange={(event) => setRoundForm({ ...roundForm, format: event.target.value as MatchFormat })}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Status<select value={roundForm.status} onChange={(event) => setRoundForm({ ...roundForm, status: event.target.value as Round['status'] })}><option value="draft">Draft</option><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option></select></label><label className="admin-full-span">Notes<textarea value={roundForm.notes} onChange={(event) => setRoundForm({ ...roundForm, notes: event.target.value })} /></label><SaveButton state={states.round} label={roundForm.id ? 'Save selected round' : 'Create round'} />{roundForm.id ? <SaveButton state={states['delete-round']} label="Delete safe round" onClick={() => removeRound()} /> : null}</form><div className="admin-card-list">{adminData.rounds.length === 0 ? <p>No rounds have been added yet.</p> : adminData.rounds.map((round) => { const noteParts = splitRoundNotes(round.notes); return <article className="admin-mini-card" key={round.id}><div><strong>Round {round.roundNumber}: {round.name}</strong><span>{formatDate(round.roundDate)} · {noteParts.session}{round.teeTime ? ` · ${round.teeTime}` : ''}</span><span>{round.courseName ?? 'Course TBC'} · {round.formatLabel ?? 'Format TBC'} · {round.status}</span></div><button type="button" onClick={() => { setRoundForm(emptyRoundForm(round)); scrollAdminPanelTop(); }}>Edit</button>{round.status === 'draft' || round.status === 'planned' ? <button type="button" onClick={() => removeRound(round)}>Delete</button> : null}</article>; })}</div></>}</section> : null}

        {activeTab === 'Matches & pairings' ? <section className="card admin-panel"><p className="eyebrow">Matches & pairings</p><h3>Draft and publish pairings</h3>{!selectedTour ? <p>No tour is available.</p> : adminData.rounds.length === 0 ? <p>No rounds have been added yet.</p> : <><label>Round<select value={matchForm.roundId} onChange={(event) => { const round = adminData.rounds.find((candidate) => candidate.id === event.target.value); setMatchForm(emptyMatchForm(round)); }}><option value="">Choose round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select></label><form className="admin-form-grid" onSubmit={submitMatch}><label>Match number<input value={matchForm.matchNumber} onChange={(event) => setMatchForm({ ...matchForm, matchNumber: event.target.value })} inputMode="numeric" /></label><label>Format<select value={matchForm.format} onChange={(event) => setMatchForm({ ...matchForm, format: event.target.value as MatchFormat })}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Side A team<select value={matchForm.sideATeamId} onChange={(event) => setMatchForm({ ...matchForm, sideATeamId: event.target.value })}><option value="">Choose team</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Side B team<select value={matchForm.sideBTeamId} onChange={(event) => setMatchForm({ ...matchForm, sideBTeamId: event.target.value })}><option value="">Choose team</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Points available<input value={matchForm.pointsAvailable} onChange={(event) => setMatchForm({ ...matchForm, pointsAvailable: event.target.value })} inputMode="decimal" /></label><label>Tee time<input value={matchForm.teeTime} onChange={(event) => setMatchForm({ ...matchForm, teeTime: event.target.value })} /></label><label>Status<select value={matchForm.status} onChange={(event) => setMatchForm({ ...matchForm, status: event.target.value as Match['status'] })}><option value="draft">Draft</option><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option><option value="void">Void</option></select></label><label>Side A points<input value={matchForm.pointsSideA} onChange={(event) => setMatchForm({ ...matchForm, pointsSideA: event.target.value })} inputMode="decimal" /></label><label>Side B points<input value={matchForm.pointsSideB} onChange={(event) => setMatchForm({ ...matchForm, pointsSideB: event.target.value })} inputMode="decimal" /></label><label>Result text<input value={matchForm.resultText} onChange={(event) => setMatchForm({ ...matchForm, resultText: event.target.value })} placeholder="e.g. Team A wins 2&1" /></label><label className="publish-toggle"><input type="checkbox" checked={matchForm.published} onChange={(event) => setMatchForm({ ...matchForm, published: event.target.checked })} /> Published publicly</label><label>Side A label<input value={matchForm.sideALabel} onChange={(event) => setMatchForm({ ...matchForm, sideALabel: event.target.value })} /></label><label>Side B label<input value={matchForm.sideBLabel} onChange={(event) => setMatchForm({ ...matchForm, sideBLabel: event.target.value })} /></label><div><p className="eyebrow">Side A players</p><div className="chip-list">{activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player) => <button className={`pill ${matchForm.sideAPlayerIds.includes(player.id) ? 'selected' : ''}`} type="button" onClick={() => toggleMatchPlayer('A', player.id)} key={player.id}>{playerLabel(player)}{tourPlayers.find((tourPlayer) => tourPlayer.playerId === player.id)?.tourHandicap !== undefined ? ` · Hcp ${tourPlayers.find((tourPlayer) => tourPlayer.playerId === player.id)?.tourHandicap}` : ''}</button>)}</div></div><div><p className="eyebrow">Side B players</p><div className="chip-list">{activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player) => <button className={`pill ${matchForm.sideBPlayerIds.includes(player.id) ? 'selected' : ''}`} type="button" onClick={() => toggleMatchPlayer('B', player.id)} key={player.id}>{playerLabel(player)}{tourPlayers.find((tourPlayer) => tourPlayer.playerId === player.id)?.tourHandicap !== undefined ? ` · Hcp ${tourPlayers.find((tourPlayer) => tourPlayer.playerId === player.id)?.tourHandicap}` : ''}</button>)}</div></div><label className="admin-full-span">Notes<textarea value={matchForm.notes} onChange={(event) => setMatchForm({ ...matchForm, notes: event.target.value })} /></label><SaveButton state={states.match} label={matchForm.id ? 'Save match' : 'Create match'} /></form><div className="admin-card-list">{roundMatches.length === 0 ? <p>No matches have been added for this round yet.</p> : roundMatches.map((match) => <article className="admin-mini-card" key={match.id}><div><strong>Match {match.matchNumber}: {teamsById.get(match.sideATeamId)?.name ?? 'Side A'} v {teamsById.get(match.sideBTeamId)?.name ?? 'Side B'}</strong><span>{match.format} · {match.status} · {match.published ? 'Published' : 'Draft/unpublished'} · {match.pointsAvailable} pts{match.status === 'complete' ? ` · ${match.pointsSideA ?? 0}-${match.pointsSideB ?? 0}` : ''}</span></div><button type="button" onClick={() => { const participants = adminData.matchParticipants.filter((participant) => participant.matchId === match.id); setMatchForm({ ...emptyMatchForm(selectedMatchRound, match), sideAPlayerIds: participants.filter((participant) => participant.side === 'A').map((participant) => participant.playerId), sideBPlayerIds: participants.filter((participant) => participant.side === 'B').map((participant) => participant.playerId) }); }}>Edit</button>{match.status !== 'complete' ? <button type="button" onClick={() => removeMatch(match)}>Delete draft match</button> : null}{states[`delete-match-${match.id}`]?.error ? <span className="form-error">{states[`delete-match-${match.id}`]?.error}</span> : null}</article>)}</div></>}</section> : null}


        {activeTab === 'Bet Punto' ? <section className="card admin-panel"><p className="eyebrow">Bet Punto</p><h3>Markets, options and indicative payouts</h3>{!selectedTour ? <p>No tour is available.</p> : <><div className="premium-inset"><p className="eyebrow">Quick market setup</p><p>Choose a round first for day-specific markets. Stableford winner options use all attending active players; scramble and better ball options use the teams already assigned to that round's pairings.</p><div className="chip-list"><button className="pill" type="button" onClick={applyStablefordWinnerOptions}>Stableford winner: all attending players</button><button className="pill" type="button" onClick={() => applyRoundTeamScoreOptions('Scramble lowest score')}>Scramble lowest score: round teams</button><button className="pill" type="button" onClick={() => applyRoundTeamScoreOptions('Better ball lowest score')}>Better ball lowest score: round teams</button></div></div><form className="admin-form-grid" onSubmit={submitBetMarket}><label>Title<input value={betMarketForm.title} onChange={(event) => setBetMarketForm({ ...betMarketForm, title: event.target.value })} /></label><label>Type<select value={betMarketForm.marketType} onChange={(event) => setBetMarketForm({ ...betMarketForm, marketType: event.target.value as BetMarket['marketType'] })}><option value="player_performance">Player performance</option><option value="team_result">Team result</option><option value="match_winner">Match winner</option><option value="over_under">Over/under</option><option value="special">Special</option><option value="custom">Custom</option></select></label><label>Scope<select value={betMarketForm.marketScope} onChange={(event) => setBetMarketForm({ ...betMarketForm, marketScope: event.target.value as BetMarket['marketScope'] })}><option value="general_pot">General pot</option><option value="special">Special/manual</option></select></label><label>Status<select value={betMarketForm.status} onChange={(event) => setBetMarketForm({ ...betMarketForm, status: event.target.value as BetMarket['status'] })}><option value="open">Open</option><option value="closed">Closed</option><option value="settled">Settled</option><option value="void">Void</option></select></label><label>Round<select value={betMarketForm.roundId} onChange={(event) => setBetMarketForm({ ...betMarketForm, roundId: event.target.value })}><option value="">No round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select></label><label>Match<select value={betMarketForm.matchId} onChange={(event) => setBetMarketForm({ ...betMarketForm, matchId: event.target.value })}><option value="">No match</option>{adminData.matches.map((match) => <option value={match.id} key={match.id}>Match {match.matchNumber}</option>)}</select></label><label>Close time<input value={betMarketForm.closesAt} onChange={(event) => setBetMarketForm({ ...betMarketForm, closesAt: event.target.value })} placeholder="Optional ISO/date text" /></label><label>Result option<select value={betMarketForm.resultOptionId} onChange={(event) => setBetMarketForm({ ...betMarketForm, resultOptionId: event.target.value })}><option value="">No result</option>{betMarketForm.options.filter((option) => option.id).map((option) => <option value={option.id} key={option.id}>{option.label || 'Option'}</option>)}</select></label><label className="admin-full-span">Description<textarea value={betMarketForm.description} onChange={(event) => setBetMarketForm({ ...betMarketForm, description: event.target.value })} /></label><label className="admin-full-span">Result text<textarea value={betMarketForm.resultText} onChange={(event) => setBetMarketForm({ ...betMarketForm, resultText: event.target.value })} /></label><div className="admin-full-span"><p className="eyebrow">Options</p>{betMarketForm.options.map((option, index) => <div className="admin-form-grid" key={option.id ?? index}><label>Label<input value={option.label} onChange={(event) => setBetMarketForm({ ...betMarketForm, options: betMarketForm.options.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row) })} /></label><label>Player<select value={option.linkedPlayerId} onChange={(event) => setBetMarketForm({ ...betMarketForm, options: betMarketForm.options.map((row, rowIndex) => rowIndex === index ? { ...row, linkedPlayerId: event.target.value } : row) })}><option value="">No player</option>{activePlayers.map((player) => <option value={player.id} key={player.id}>{playerLabel(player)}</option>)}</select></label><label>Team<select value={option.linkedTeamId} onChange={(event) => setBetMarketForm({ ...betMarketForm, options: betMarketForm.options.map((row, rowIndex) => rowIndex === index ? { ...row, linkedTeamId: event.target.value } : row) })}><option value="">No team</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Side<select value={option.linkedMatchSide} onChange={(event) => setBetMarketForm({ ...betMarketForm, options: betMarketForm.options.map((row, rowIndex) => rowIndex === index ? { ...row, linkedMatchSide: event.target.value as BetOptionForm['linkedMatchSide'] } : row) })}><option value="">No side</option><option value="A">A</option><option value="B">B</option><option value="halved">Halved</option></select></label><label>Odds/multiplier<input value={option.oddsDecimal} onChange={(event) => setBetMarketForm({ ...betMarketForm, options: betMarketForm.options.map((row, rowIndex) => rowIndex === index ? { ...row, oddsDecimal: event.target.value } : row) })} inputMode="decimal" /></label><label>Sort<input value={option.sortOrder} onChange={(event) => setBetMarketForm({ ...betMarketForm, options: betMarketForm.options.map((row, rowIndex) => rowIndex === index ? { ...row, sortOrder: event.target.value } : row) })} inputMode="numeric" /></label><button type="button" onClick={() => setBetMarketForm({ ...betMarketForm, options: betMarketForm.options.filter((_, rowIndex) => rowIndex !== index) })}>Remove option</button></div>)}<button type="button" onClick={() => setBetMarketForm({ ...betMarketForm, options: [...betMarketForm.options, emptyBetOptionForm(betMarketForm.options.length + 1)] })}>Add option</button></div><SaveButton state={states['bet-market']} label={betMarketForm.id ? 'Save market' : 'Create market'} /></form><div className="admin-card-list">{adminData.betMarkets.length === 0 ? <p>No Bet Punto markets yet.</p> : adminData.betMarkets.map((market) => { const marketBets = adminData.bets.filter((bet) => bet.marketId === market.id); return <article className="admin-mini-card" key={market.id}><div><strong>{market.title}</strong><span>{market.marketScope === 'general_pot' ? 'General pot' : 'Special/manual'} · {market.status} · {marketBets.length} bets</span><div className="chip-list">{adminData.betOptions.filter((option) => option.marketId === market.id).map((option) => <span className="pill" key={option.id}>{option.label}{option.oddsDecimal ? ` · ${option.oddsDecimal}x` : ''}</span>)}</div></div><button type="button" onClick={() => setBetMarketForm(betFormFromMarket(market))}>Edit market</button></article>; })}</div>{selectedBetMarket ? <div className="premium-inset"><p className="eyebrow">Bets for selected market</p>{selectedBetMarketBets.length === 0 ? <p>No bets logged.</p> : selectedBetMarketBets.map((bet) => <p key={bet.id}>{bet.bettorName} → {selectedBetMarketOptions.find((option) => option.id === bet.optionId)?.label ?? 'Option'} · {bet.stakeText ?? `${(bet.stakeAmountPence ?? 0) / 100}`} · {bet.status}/{bet.outcomeStatus}/{bet.payoutStatus}{bet.payoutAmountPence !== undefined ? ` · payout £${(bet.payoutAmountPence / 100).toFixed(2)}` : ''}<button type="button" onClick={() => updateBetOutcome(bet, 'won')}>Won</button><button type="button" onClick={() => updateBetOutcome(bet, 'lost')}>Lost</button><button type="button" onClick={() => updateBetOutcome(bet, 'push')}>Push</button><button type="button" onClick={() => promptBetPayout(bet)}>Payout note</button><button type="button" onClick={() => updateBetStatus(bet, bet.status === 'void' ? 'active' : 'void')}>{bet.status === 'void' ? 'Restore' : 'Void'}</button>{states[`bet-${bet.id}`]?.error ? <span className="form-error">{states[`bet-${bet.id}`]?.error}</span> : null}</p>)}</div> : null}<p className="form-success">Bet Punto tracks private tour stakes and indicative payouts only. No wallet, payment handling or money transfer is added.</p></>}</section> : null}

        {activeTab === 'Coming next' ? <section className="card admin-panel"><p className="eyebrow">Coming next</p><h3>Deliberately deferred</h3><div className="workflow-list"><span>Scorecard summaries</span><span>Birdies/bogeys/stableford entry</span><span>Site-wide Tour PIN lock</span><span>Public redesign</span></div></section> : null}
      </> : null}
    </> : <section className="card admin-locked-panel"><p className="eyebrow">Locked</p><h3>Admin tools are hidden until a valid PIN session is active.</h3><p>Public users can open this route, but setup management stays behind the shared admin PIN.</p></section>}
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>;
}

function SaveButton({ state, label, onClick }: { state?: SaveState; label: string; onClick?: () => void }) {
  return <div className="admin-save-row"><button type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={state?.saving}>{state?.saving ? 'Saving…' : label}</button>{state?.error ? <p className="form-error">{state.error}</p> : null}{state?.success ? <p className="form-success">{state.success}</p> : null}</div>;
}

function StatusGroup({ title, players }: { title: string; players: Player[] }) {
  return <div><p className="eyebrow">{title}</p><div className="chip-list">{players.length === 0 ? <span className="pill">None</span> : players.map((player) => <span className="pill" key={player.id}>{playerLabel(player)}</span>)}</div></div>;
}
