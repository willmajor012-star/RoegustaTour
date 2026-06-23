import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { deleteBetMarket, resetBetPuntoTour, deleteHandbookSection, deleteMatch, deleteRound, deleteTeam, deleteTour, fetchAdminData, saveBet, saveBetMarket, saveHandbookSection, settleBetMarket, setCurrentPublicTour, submitResult, updateBet, updateRoundPublished, updateTeamPublished, updateMatchPublished, saveMatch, savePlayer, saveRound, saveTour, saveTourPlayer, saveTourTeam, saveTourTeamMembers, type AdminDataResponse } from '../lib/adminApi';
import { checkStoredAdminSession, clearStoredAdminSession, getStoredAdminSession, loginWithAdminPin, storeAdminSession, type StoredAdminSession } from '../lib/adminSession';
import { betMarketVisibilityWarning, publicBetPuntoMatchIds, publicBetPuntoPlayerIds, publicBetPuntoRoundIds, publicBetPuntoTeamIds } from '../lib/betPuntoRules';
import { betPuntoMarketKind, betPuntoMarketKindLabel, buildBetPuntoBettorSummaries, buildBetPuntoMarketSummaries, defaultBetMarketCloseLocal, formatPenceCurrency, formatStakeCurrency } from '../lib/betting';
import { formatDate } from '../lib/formatting';
import { formatTeeTimeDisplay, normalizeTeeTime } from '../lib/display';
import { deriveMatchPoints, MATCHPLAY_RESULT_OPTIONS, normalizeMatchplayResult } from '../lib/matchplay';
import type { Bet, BetMarket, BetOption, Match, MatchFormat, Player, Round, Tour, TourTeam } from '../lib/types';

const tabs = ['Overview', 'Tour setup', 'Player library', 'Squads & teams', 'Rounds & tee times', 'Matches & pairings', 'Result entry', 'Handbook', 'Bet Punto', 'Coming next'] as const;
type AdminTab = typeof tabs[number];
type SaveState = { saving: boolean; error?: string; success?: string };

type PlayerForm = { id?: string; displayName: string; nickname: string; initials: string; photoUrl: string; profileBio: string; active: boolean };
type TourForm = { id?: string; name: string; year: string; location: string; startDate: string; endDate: string; status: Tour['status']; description: string };
type AttendanceDraft = { attending: boolean; tourHandicap: string; notes: string; nickname: string; photoUrl: string; profileBio: string; teamId: string };
type TeamForm = { id?: string; name: string; colour: string; captainPlayerId: string; sortOrder: string };
type RoundForm = { id?: string; roundNumber: string; name: string; roundDate: string; session: 'AM' | 'PM' | 'TBC'; courseName: string; teeTime: string; format: MatchFormat; notes: string; status: Round['status'] };
type RoundPlanForm = { count: string; namePrefix: string; courseName: string; format: MatchFormat; status: Round['status'] };
type MatchForm = { id?: string; roundId: string; matchNumber: string; format: MatchFormat; status: Match['status']; sideATeamId: string; sideBTeamId: string; sideALabel: string; sideBLabel: string; pointsAvailable: string; pointsSideA: string; pointsSideB: string; resultText: string; teeTime: string; published: boolean; notes: string; sideAPlayerIds: string[]; sideBPlayerIds: string[] };
type BetOptionForm = { id?: string; label: string; linkedPlayerId: string; linkedTeamId: string; linkedMatchSide: '' | 'A' | 'B' | 'halved'; oddsDecimal: string; sortOrder: string };
type AdminBetForm = { id?: string; optionId: string; bettorName: string; bettorPlayerId: string; stake: string; comment: string; adminNotes: string; status: Bet['status'] };
type BetMarketForm = { id?: string; title: string; description: string; marketType: BetMarket['marketType']; marketScope: BetMarket['marketScope']; status: BetMarket['status']; required: boolean; roundId: string; matchId: string; closesAt: string; resultOptionId: string; resultText: string; options: BetOptionForm[] };
type ResultForm = { roundId: string; matchId: string; resultText: string; winningSide: '' | 'A' | 'B'; published: boolean; correctionReason: string };
type TeeTimePlanForm = { firstTeeTime: string; intervalMinutes: string };
type HandbookForm = { id?: string; sectionKey: string; title: string; body: string; sortOrder: string };

const emptyPlayerForm: PlayerForm = { displayName: '', nickname: '', initials: '', photoUrl: '', profileBio: '', active: true };
const emptyTeamForm: TeamForm = { name: '', colour: '', captainPlayerId: '', sortOrder: '1' };
const emptyAdminBetForm: AdminBetForm = { optionId: '', bettorName: '', bettorPlayerId: '', stake: '5.00', comment: '', adminNotes: '', status: 'active' };
const emptyBetOptionForm = (sortOrder = 1): BetOptionForm => ({ label: '', linkedPlayerId: '', linkedTeamId: '', linkedMatchSide: '', oddsDecimal: '', sortOrder: String(sortOrder) });
const roundCountOptions = Array.from({ length: 8 }, (_, index) => index + 1);
const roundSessionOptions: RoundForm['session'][] = ['TBC', 'AM', 'PM'];
const emptyRoundPlanForm: RoundPlanForm = { count: '1', namePrefix: 'Round', courseName: '', format: 'singles', status: 'planned' };
const scrollAdminPanelTop = () => window.setTimeout(() => document.querySelector('.admin-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
const emptyResultForm: ResultForm = { roundId: '', matchId: '', resultText: '', winningSide: '', published: true, correctionReason: '' };
const resultOptions = MATCHPLAY_RESULT_OPTIONS;
const emptyBetMarketForm: BetMarketForm = { title: '', description: '', marketType: 'custom', marketScope: 'general_pot', status: 'draft', required: false, roundId: '', matchId: '', closesAt: '', resultOptionId: '', resultText: '', options: [emptyBetOptionForm(1), emptyBetOptionForm(2)] };
const emptyTeeTimePlanForm: TeeTimePlanForm = { firstTeeTime: '', intervalMinutes: '8' };
const emptyHandbookForm: HandbookForm = { sectionKey: '', title: '', body: '', sortOrder: '1' };
const formatOptions: { value: MatchFormat; label: string }[] = [
  { value: 'singles', label: 'Singles' },
  { value: 'better_ball', label: 'Better ball' },
  { value: 'foursomes', label: 'Foursomes' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'custom', label: 'Custom' },
];
const formatByLabel = new Map(formatOptions.map((option) => [option.label.toLowerCase(), option.value]));

const duplicateMatchNumberMessage = 'A match with this number already exists for this round. Edit the existing match or use the next available match number.';
const maxPlayersForFormat = (format: MatchFormat) => format === 'singles' ? 1 : format === 'custom' ? Number.POSITIVE_INFINITY : 2;
const nextAvailableMatchNumber = (roundId: string, matches: Match[], excludeMatchId?: string) => {
  const usedNumbers = new Set(matches.filter((match) => match.roundId === roundId && match.id !== excludeMatchId).map((match) => match.matchNumber));
  let candidate = 1;
  while (usedNumbers.has(candidate)) candidate += 1;
  return candidate;
};

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

function emptyMatchForm(round?: Round, match?: Match, matchNumber = '1'): MatchForm {
  const defaultFormat = formatByLabel.get((round?.formatLabel ?? '').toLowerCase()) ?? 'singles';
  return { id: match?.id, roundId: match?.roundId ?? round?.id ?? '', matchNumber: match?.matchNumber ? String(match.matchNumber) : matchNumber, format: match?.format ?? defaultFormat, status: match?.status ?? 'planned', sideATeamId: match?.sideATeamId ?? '', sideBTeamId: match?.sideBTeamId ?? '', sideALabel: match?.sideALabel ?? '', sideBLabel: match?.sideBLabel ?? '', pointsAvailable: match?.pointsAvailable ? String(match.pointsAvailable) : '1', pointsSideA: match?.pointsSideA === undefined ? '' : String(match.pointsSideA), pointsSideB: match?.pointsSideB === undefined ? '' : String(match.pointsSideB), resultText: match?.resultText ?? '', teeTime: match?.teeTime ?? '', published: match?.published ?? false, notes: match?.notes ?? '', sideAPlayerIds: [], sideBPlayerIds: [] };
}


function isoToDatetimeLocal(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function roundCutoffDefault(round: Round | undefined, matches: Match[] = []) {
  return defaultBetMarketCloseLocal(round, matches).value;
}

function roundCutoffWarning(round: Round | undefined, matches: Match[] = []) {
  return defaultBetMarketCloseLocal(round, matches).warning;
}

function playerLabel(player?: Player): string {
  if (!player) return 'Unknown player';
  return player.nickname ? `${player.displayName} (${player.nickname})` : player.displayName;
}

function betPuntoMandatoryBettorName(player: Player): string {
  // Public Bet Punto submissions use displayName from the datalist, so mandatory summaries must key on the same value rather than the nickname label.
  return player.displayName;
}


function isAcceptedTeeTime(value: string) {
  const trimmed = value.trim();
  return trimmed === '' || /^tbc$/i.test(trimmed) || Boolean(normalizeTeeTime(trimmed));
}

function addMinutesToTeeTime(value: string, minutes: number) {
  const normalized = normalizeTeeTime(value);
  if (!normalized) return value.trim();
  const [hour, minute] = normalized.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  const wrapped = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
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
  const [inlinePlayerForm, setInlinePlayerForm] = useState<PlayerForm | null>(null);
  const [tourForm, setTourForm] = useState<TourForm>(emptyTourForm());
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [roundForm, setRoundForm] = useState<RoundForm>(emptyRoundForm());
  const [roundPlanForm, setRoundPlanForm] = useState<RoundPlanForm>(emptyRoundPlanForm);
  const [matchForm, setMatchForm] = useState<MatchForm>(emptyMatchForm());
  const [betMarketForm, setBetMarketForm] = useState<BetMarketForm>(emptyBetMarketForm);
  const [adminBetForm, setAdminBetForm] = useState<AdminBetForm>(emptyAdminBetForm);
  const [resultForm, setResultForm] = useState<ResultForm>(emptyResultForm);
  const [teeTimePlanForm, setTeeTimePlanForm] = useState<TeeTimePlanForm>(emptyTeeTimePlanForm);
  const [handbookForm, setHandbookForm] = useState<HandbookForm>(emptyHandbookForm);
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [betPuntoResetConfirmation, setBetPuntoResetConfirmation] = useState('');
  const [betPuntoResetForceCurrent, setBetPuntoResetForceCurrent] = useState(false);
  const loadSnapshotRef = useRef({ roundFormId: roundForm.id, matchFormId: matchForm.id, matchRoundId: matchForm.roundId });

  useEffect(() => { loadSnapshotRef.current = { roundFormId: roundForm.id, matchFormId: matchForm.id, matchRoundId: matchForm.roundId }; }, [roundForm.id, matchForm.id, matchForm.roundId]);

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
        return [player.id, { attending: tourPlayer?.attending ?? false, tourHandicap: tourPlayer?.tourHandicap === undefined ? '' : String(tourPlayer.tourHandicap), notes: tourPlayer?.notes ?? '', nickname: tourPlayer?.nickname ?? '', photoUrl: tourPlayer?.photoUrl ?? '', profileBio: tourPlayer?.profileBio ?? '', teamId: memberByPlayer.get(player.id) ?? '' }];
      })));
      const snapshot = loadSnapshotRef.current;
      const selectedRoundForEditor = nextData.rounds.find((round) => round.id === snapshot.roundFormId) ?? nextData.rounds[0];
      setRoundForm(emptyRoundForm(selectedRoundForEditor));
      setRoundPlanForm({ ...emptyRoundPlanForm, count: String(Math.min(Math.max(nextData.rounds.length || 1, 1), 8)), courseName: selected?.location ?? '' });
      const selectedMatchForEditor = nextData.matches.find((match) => match.id === snapshot.matchFormId);
      const selectedRoundForMatch = nextData.rounds.find((round) => round.id === (selectedMatchForEditor?.roundId ?? snapshot.matchRoundId)) ?? selectedRoundForEditor ?? nextData.rounds[0];
      const selectedMatchParticipants = selectedMatchForEditor ? nextData.matchParticipants.filter((participant) => participant.matchId === selectedMatchForEditor.id) : [];
      setMatchForm({
        ...emptyMatchForm(selectedRoundForMatch, selectedMatchForEditor, String(nextAvailableMatchNumber(selectedRoundForMatch?.id ?? '', nextData.matches))),
        sideAPlayerIds: selectedMatchParticipants.filter((participant) => participant.side === 'A').map((participant) => participant.playerId),
        sideBPlayerIds: selectedMatchParticipants.filter((participant) => participant.side === 'B').map((participant) => participant.playerId),
      });
      const nextResultRound = nextData.rounds.find((round) => round.id === resultForm.roundId) ?? selectedRoundForMatch ?? nextData.rounds[0];
      const nextResultMatch = nextData.matches.find((match) => match.id === resultForm.matchId) ?? nextData.matches.find((match) => match.roundId === nextResultRound?.id);
      if (nextResultRound && nextResultMatch) setResultForm((current) => ({ ...current, roundId: nextResultRound.id, matchId: nextResultMatch.id, resultText: current.matchId === nextResultMatch.id ? current.resultText : nextResultMatch.resultText ?? '', winningSide: current.matchId === nextResultMatch.id ? current.winningSide : nextResultMatch.winningSide === 'A' || nextResultMatch.winningSide === 'B' ? nextResultMatch.winningSide : '', published: nextResultMatch.published ?? true }));
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
  const teamIdByPlayer = useMemo(() => new Map((adminData?.tourTeamMembers ?? []).map((member) => [member.playerId, member.teamId])), [adminData]);
  const activePlayers = (adminData?.players ?? []).filter((player) => player.active);
  const inactivePlayers = (adminData?.players ?? []).filter((player) => !player.active);
  const tourPlayers = adminData?.tourPlayers ?? [];
  const attendingPlayerIds = new Set(tourPlayers.filter((row) => row.attending).map((row) => row.playerId));
  const assignedPlayerIds = new Set((adminData?.tourTeamMembers ?? []).map((member) => member.playerId));
  const attendingUnassigned = activePlayers.filter((player) => attendingPlayerIds.has(player.id) && !assignedPlayerIds.has(player.id));
  const liveTourPlayers = activePlayers.filter((player) => attendingPlayerIds.has(player.id));
  const notAttending = activePlayers.filter((player) => !attendingPlayerIds.has(player.id));
  const selectedRound = (adminData?.rounds ?? []).find((round) => round.id === roundForm.id) ?? adminData?.rounds[0];
  const selectedMatchRound = (adminData?.rounds ?? []).find((round) => round.id === matchForm.roundId) ?? adminData?.rounds[0];
  const roundMatches = (adminData?.matches ?? []).filter((match) => match.roundId === matchForm.roundId);
  const draftMatches = (adminData?.matches ?? []).filter((match) => !match.published && match.status !== 'complete').length;
  const publishedMatches = (adminData?.matches ?? []).filter((match) => match.published).length;
  const completeMatches = (adminData?.matches ?? []).filter((match) => match.status === 'complete').length;
  const selectedRoundMatchCount = (adminData?.matches ?? []).filter((match) => match.roundId === roundForm.id).length;
  const resultRound = (adminData?.rounds ?? []).find((round) => round.id === resultForm.roundId) ?? adminData?.rounds[0];
  const resultMatches = resultRound ? (adminData?.matches ?? []).filter((match) => match.roundId === resultRound.id) : [];
  const resultMatch = resultMatches.find((match) => match.id === resultForm.matchId) ?? resultMatches[0];
  const resultParticipants = resultMatch ? (adminData?.matchParticipants ?? []).filter((participant) => participant.matchId === resultMatch.id) : [];
  const selectedBetMarket = (adminData?.betMarkets ?? []).find((market) => market.id === betMarketForm.id);
  const selectedBetMarketBets = selectedBetMarket ? (adminData?.bets ?? []).filter((bet) => bet.marketId === selectedBetMarket.id) : [];
  const selectedBetMarketOptions = selectedBetMarket ? (adminData?.betOptions ?? []).filter((option) => option.marketId === selectedBetMarket.id) : [];
  const mandatoryBettorNames = activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map(betPuntoMandatoryBettorName);
  const betPuntoBettorSummaries = useMemo(() => buildBetPuntoBettorSummaries(adminData?.betMarkets ?? [], adminData?.betOptions ?? [], adminData?.bets ?? [], mandatoryBettorNames), [adminData?.betMarkets, adminData?.betOptions, adminData?.bets, mandatoryBettorNames]);
  const betPuntoMarketSummaries = useMemo(() => buildBetPuntoMarketSummaries(adminData?.betMarkets ?? [], adminData?.betOptions ?? [], adminData?.bets ?? [], mandatoryBettorNames), [adminData?.betMarkets, adminData?.betOptions, adminData?.bets, mandatoryBettorNames]);
  const betPuntoMandatorySummaries = betPuntoMarketSummaries.filter((summary) => summary.market.required ?? (summary.market.marketType === 'player_performance' && summary.market.title.toLowerCase().includes('stableford')));
  const betPuntoTotalStakePence = betPuntoBettorSummaries.reduce((total, summary) => total + summary.totalStakePence, 0);
  const betPuntoSettledPayoutPence = betPuntoBettorSummaries.reduce((total, summary) => total + summary.settledPayoutPence, 0);
  const matchMaxPlayers = maxPlayersForFormat(matchForm.format);
  const matchSideALabel = matchForm.sideAPlayerIds.map((playerId) => playerLabel(playersById.get(playerId))).join(' / ') || (matchForm.sideALabel || teamsById.get(matchForm.sideATeamId)?.name || 'First team TBC');
  const matchSideBLabel = matchForm.sideBPlayerIds.map((playerId) => playerLabel(playersById.get(playerId))).join(' / ') || (matchForm.sideBLabel || teamsById.get(matchForm.sideBTeamId)?.name || 'Second team TBC');
  const bookedPlayerIdsForRound = useMemo(() => new Set((adminData?.matchParticipants ?? []).filter((participant) => {
    const match = (adminData?.matches ?? []).find((candidate) => candidate.id === participant.matchId);
    return match?.roundId === matchForm.roundId && participant.matchId !== matchForm.id;
  }).map((participant) => participant.playerId)), [adminData, matchForm.roundId, matchForm.id]);
  const matchTitle = (match: Match) => {
    const participants = adminData?.matchParticipants.filter((participant) => participant.matchId === match.id) ?? [];
    const sideA = participants.filter((participant) => participant.side === 'A').map((participant) => playerLabel(playersById.get(participant.playerId))).join(' / ') || teamsById.get(match.sideATeamId)?.name || 'First team';
    const sideB = participants.filter((participant) => participant.side === 'B').map((participant) => playerLabel(playersById.get(participant.playerId))).join(' / ') || teamsById.get(match.sideBTeamId)?.name || 'Second team';
    return `Match ${match.matchNumber}: ${sideA} v ${sideB}`;
  };
  const resetMatchForm = () => setMatchForm(emptyMatchForm(selectedMatchRound, undefined, String(nextAvailableMatchNumber(selectedMatchRound?.id ?? '', adminData?.matches ?? []))));
  const noEligibleSideAPlayers = Boolean(matchForm.sideATeamId) && activePlayers.filter((player) => attendingPlayerIds.has(player.id) && teamIdByPlayer.get(player.id) === matchForm.sideATeamId && !bookedPlayerIdsForRound.has(player.id)).length === 0;
  const noEligibleSideBPlayers = Boolean(matchForm.sideBTeamId) && activePlayers.filter((player) => attendingPlayerIds.has(player.id) && teamIdByPlayer.get(player.id) === matchForm.sideBTeamId && !bookedPlayerIdsForRound.has(player.id)).length === 0;


  const attendanceChanges = activePlayers.filter((player) => {
    const draft = attendanceDrafts[player.id];
    const original = tourPlayers.find((row) => row.playerId === player.id);
    if (!draft) return false;
    return draft.attending !== (original?.attending ?? false)
      || draft.tourHandicap !== (original?.tourHandicap === undefined ? '' : String(original.tourHandicap))
      || draft.notes !== (original?.notes ?? '')
      || draft.nickname !== (original?.nickname ?? '')
      || draft.photoUrl !== (original?.photoUrl ?? '')
      || draft.profileBio !== (original?.profileBio ?? '');
  });
  const teamAssignmentChanged = activePlayers.some((player) => (attendanceDrafts[player.id]?.teamId ?? '') !== (teamIdByPlayer.get(player.id) ?? ''));
  const matchParticipantIds = new Set((adminData?.matchParticipants ?? [])
    .filter((participant) => (adminData?.matches ?? []).some((match) => match.id === participant.matchId && (match.published || match.status === 'complete')))
    .map((participant) => participant.playerId));
  const assignablePlayers = activePlayers.filter((player) => attendanceDrafts[player.id]?.attending);
  const teamAssignmentCounts = adminData?.tourTeams.map((team) => ({ team, count: assignablePlayers.filter((player) => attendanceDrafts[player.id]?.teamId === team.id).length })) ?? [];
  const unassignedAssignableCount = assignablePlayers.filter((player) => !attendanceDrafts[player.id]?.teamId).length;

  const betPuntoVisibilityWarnings = useMemo(() => {
    const data = adminData;
    if (!data) return [];
    const context = {
      roundIds: publicBetPuntoRoundIds(data.rounds.filter((round) => round.published || round.status === 'complete')),
      matchIds: publicBetPuntoMatchIds(data.matches.filter((match) => (match.published || match.status === 'complete') && data.rounds.some((round) => round.id === match.roundId && (round.published || round.status === 'complete')))),
      playerIds: publicBetPuntoPlayerIds(data.players, data.tourPlayers),
      teamIds: publicBetPuntoTeamIds(data.tourTeams, data.tourTeamMembers),
    };
    return data.betMarkets.filter((market) => market.status !== 'void').map((market) => betMarketVisibilityWarning(market, data.betOptions, context)).filter((warning): warning is NonNullable<typeof warning> => Boolean(warning));
  }, [adminData]);

  const setSaveState = (key: string, state: SaveState) => setStates((current) => ({ ...current, [key]: state }));
  const runSave = async (key: string, success: string, action: () => Promise<string | void>) => {
    const scrollY = window.scrollY;
    setSaveState(key, { saving: true });
    try {
      const nextTourId = await action();
      await loadAdminData(nextTourId || selectedTourId);
      window.setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'auto' }), 0);
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
  const submitRound = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('round', 'Round saved. Stableford market created if this was a new betting round.', async () => { const response = await saveRound({ ...roundForm, tourId: selectedTour.id, roundNumber: Number(roundForm.roundNumber), roundDate: roundForm.roundDate || null, courseName: roundForm.courseName || null, teeTime: roundForm.teeTime || null, notes: combineRoundNotes(roundForm.session, roundForm.notes) }); const existingStableford = adminData?.betMarkets.some((market) => market.roundId === response.round.id && market.marketType === 'player_performance' && market.title.toLowerCase().includes('stableford')); const eligibleOptions = stablefordOptionsForAttendingPlayers(); if (!existingStableford && eligibleOptions.length > 0) await saveBetMarket({ tourId: selectedTour.id, roundId: response.round.id, matchId: null, title: `${roundBetLabelFromRound(response.round)} stableford winner`, description: 'Pick the player with the best Stableford score for this round/day.', marketType: 'player_performance', marketScope: 'general_pot', status: 'draft', required: true, closesAt: datetimeLocalToIso(roundCutoffDefault(response.round, adminData?.matches ?? [])), resultOptionId: null, resultText: null, options: eligibleOptions.map((option, index) => ({ label: option.label, linkedPlayerId: option.linkedPlayerId || null, linkedTeamId: null, linkedMatchSide: null, oddsDecimal: null, sortOrder: index + 1 })) }); return selectedTour.id; }); };
  const publishCurrentTour = (tour: Tour) => { const currentBetCount = (adminData?.betMarkets.length ?? 0) + (adminData?.bets.length ?? 0); if (selectedTour?.id !== tour.id && currentBetCount > 0 && !window.confirm(`Set ${tour.name} as current public? ${selectedTour?.name ?? 'The selected tour'} still has ${currentBetCount} Bet Punto market/bet records. Use the Bet Punto reset panel if you want a deliberate clean slate for that tour.`)) return; void runSave(`current-public-tour-${tour.id}`, `${tour.name} is now the current public tour.`, async () => { await setCurrentPublicTour({ tourId: tour.id }); return tour.id; }); };
  const toggleRoundPublished = (round: Round) => { if (!selectedTour) return; void runSave(`round-published-${round.id}`, round.published ? 'Round unpublished from public app.' : 'Round published to public app.', async () => { await updateRoundPublished({ tourId: selectedTour.id, roundId: round.id, published: !round.published }); return selectedTour.id; }); };
  const toggleTeamPublished = (team: TourTeam) => { if (!selectedTour) return; void runSave(`team-published-${team.id}`, team.published ? 'Team roster unpublished from public app.' : 'Team roster published to public app.', async () => { await updateTeamPublished({ tourId: selectedTour.id, teamId: team.id, published: !team.published }); return selectedTour.id; }); };

  const publishRoundMatches = () => { if (!selectedTour) return; void runSave('publish-round-matches', 'All matches for this round published.', async () => { for (const match of roundMatches) await updateMatchPublished({ tourId: selectedTour.id, matchId: match.id, published: true }); return selectedTour.id; }); };
  const publishCurrentTourContent = () => { if (!selectedTour) return; void runSave('publish-tour-content', 'All rosters, rounds and matches for this tour published.', async () => { for (const team of adminData?.tourTeams ?? []) await updateTeamPublished({ tourId: selectedTour.id, teamId: team.id, published: true }); for (const round of adminData?.rounds ?? []) await updateRoundPublished({ tourId: selectedTour.id, roundId: round.id, published: true }); for (const match of adminData?.matches ?? []) await updateMatchPublished({ tourId: selectedTour.id, matchId: match.id, published: true }); return selectedTour.id; }); };

  const submitMatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTour) return;
    const enteredMatchNumber = Number(matchForm.matchNumber);
    if (!matchForm.id && roundMatches.some((match) => match.matchNumber === enteredMatchNumber)) {
      setMatchForm((current) => ({ ...current, matchNumber: String(nextAvailableMatchNumber(current.roundId, adminData?.matches ?? [])) }));
      setSaveState('match', { saving: false, error: duplicateMatchNumberMessage });
      return;
    }
    if (!isAcceptedTeeTime(matchForm.teeTime)) {
      setSaveState('match', { saving: false, error: 'Tee time can be blank, TBC, H:mm or HH:mm.' });
      return;
    }
    void runSave('match', matchForm.id ? 'Match changes saved.' : 'Match created. Next match number prepared.', async () => { await saveMatch({ ...matchForm, tourId: selectedTour.id, matchNumber: enteredMatchNumber, pointsAvailable: 1, pointsSideA: null, pointsSideB: null, resultText: null, teeTime: matchForm.teeTime || null, sideALabel: matchForm.sideALabel || null, sideBLabel: matchForm.sideBLabel || null, notes: matchForm.notes || null }); });
  };

  const saveSquadPlayer = (playerId: string) => {
    if (!selectedTour) return;
    const draft = attendanceDrafts[playerId];
    void runSave(`squad-${playerId}`, 'Player squad saved.', async () => {
      const handicap = draft.tourHandicap.trim() === '' ? null : Number(draft.tourHandicap);
      if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 54)) throw new Error('Handicap must be blank or between -10 and 54.');
      await saveTourPlayer({ tourId: selectedTour.id, playerId, attending: draft.attending, tourHandicap: handicap, notes: draft.notes, nickname: draft.nickname || null, photoUrl: draft.photoUrl || null, profileBio: draft.profileBio || null });
      for (const team of adminData?.tourTeams ?? []) {
        const currentIds = (adminData?.tourTeamMembers ?? []).filter((member) => member.teamId === team.id).map((member) => member.playerId).filter((id) => id !== playerId);
        const playerIds = draft.attending && draft.teamId === team.id ? [...currentIds, playerId] : currentIds;
        await saveTourTeamMembers({ tourId: selectedTour.id, teamId: team.id, playerIds });
      }
    });
  };


  const saveAttendanceChanges = () => {
    if (!selectedTour) return;
    void runSave('attendance-bulk', 'Attendance changes saved.', async () => {
      for (const player of attendanceChanges) {
        const draft = attendanceDrafts[player.id];
        const handicap = draft.tourHandicap.trim() === '' ? null : Number(draft.tourHandicap);
        if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 54)) throw new Error(`${player.displayName}: handicap must be blank or between -10 and 54.`);
        await saveTourPlayer({ tourId: selectedTour.id, playerId: player.id, attending: draft.attending, tourHandicap: handicap, notes: draft.notes, nickname: draft.nickname || null, photoUrl: draft.photoUrl || null, profileBio: draft.profileBio || null });
      }
      return selectedTour.id;
    });
  };

  const assignPlayerDraftTeam = (playerId: string, teamId: string) => {
    const current = attendanceDrafts[playerId];
    if (!current?.attending) return;
    setAttendanceDrafts({ ...attendanceDrafts, [playerId]: { ...current, teamId } });
  };

  const saveTeamAssignments = () => {
    if (!selectedTour) return;
    void runSave('team-assignments', 'Team assignments saved.', async () => {
      for (const player of attendanceChanges) {
        const draft = attendanceDrafts[player.id];
        const handicap = draft.tourHandicap.trim() === '' ? null : Number(draft.tourHandicap);
        if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 54)) throw new Error(`${player.displayName}: handicap must be blank or between -10 and 54.`);
        await saveTourPlayer({ tourId: selectedTour.id, playerId: player.id, attending: draft.attending, tourHandicap: handicap, notes: draft.notes, nickname: draft.nickname || null, photoUrl: draft.photoUrl || null, profileBio: draft.profileBio || null });
      }
      for (const team of adminData?.tourTeams ?? []) {
        const playerIds = activePlayers.filter((player) => attendanceDrafts[player.id]?.attending && attendanceDrafts[player.id]?.teamId === team.id).map((player) => player.id);
        await saveTourTeamMembers({ tourId: selectedTour.id, teamId: team.id, playerIds });
      }
      return selectedTour.id;
    });
  };

  const submitInlinePlayer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inlinePlayerForm?.id) return;
    void runSave(`player-${inlinePlayerForm.id}`, 'Player saved.', async () => {
      await savePlayer(inlinePlayerForm);
      setInlinePlayerForm(null);
    });
  };

  const applySequentialTeeTimes = () => {
    if (!selectedTour || !selectedMatchRound) return;
    const first = teeTimePlanForm.firstTeeTime.trim();
    const interval = Number(teeTimePlanForm.intervalMinutes);
    if (!isAcceptedTeeTime(first) || !normalizeTeeTime(first)) {
      setSaveState('tee-time-plan', { saving: false, error: 'Enter a first tee time like 08:10 or 9:00.' });
      return;
    }
    if (!Number.isInteger(interval) || interval < 1 || interval > 60) {
      setSaveState('tee-time-plan', { saving: false, error: 'Interval must be between 1 and 60 minutes.' });
      return;
    }
    const editableMatches = [...roundMatches]
      .filter((match) => match.status === 'draft' || match.status === 'planned')
      .sort((a, b) => a.matchNumber - b.matchNumber);
    if (editableMatches.length === 0) {
      setSaveState('tee-time-plan', { saving: false, error: 'No draft or planned matches are available for this round.' });
      return;
    }
    void runSave('tee-time-plan', 'Sequential tee times applied.', async () => {
      for (const [index, match] of editableMatches.entries()) {
        const participants = adminData?.matchParticipants.filter((participant) => participant.matchId === match.id) ?? [];
        await saveMatch({
          ...match,
          tourId: selectedTour.id,
          teeTime: addMinutesToTeeTime(first, index * interval),
          sideAPlayerIds: participants.filter((participant) => participant.side === 'A').map((participant) => participant.playerId),
          sideBPlayerIds: participants.filter((participant) => participant.side === 'B').map((participant) => participant.playerId),
        });
      }
      return selectedTour.id;
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
    void runSave('plan-rounds', 'Round setup saved. Hidden mandatory markets were added for new rounds when tour players are available.', async () => {
      for (let index = 0; index < count; index += 1) {
        const roundNumber = index + 1;
        const existing = adminData?.rounds.find((round) => round.roundNumber === roundNumber);
        if (existing) continue;
        const response = await saveRound({
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
        const eligibleOptions = stablefordOptionsForAttendingPlayers();
        if (eligibleOptions.length > 0) await saveBetMarket({
          tourId: selectedTour.id,
          roundId: response.round.id,
          matchId: null,
          title: `${roundBetLabelFromRound(response.round)} stableford winner`,
          description: 'Pick the player with the best Stableford score for this round/day.',
          marketType: 'player_performance',
          marketScope: 'general_pot',
          status: 'draft',
          required: true,
          closesAt: null,
          resultOptionId: null,
          resultText: null,
          options: eligibleOptions.map((option, optionIndex) => ({ label: option.label, linkedPlayerId: option.linkedPlayerId || null, linkedTeamId: null, linkedMatchSide: null, oddsDecimal: null, sortOrder: optionIndex + 1 })),
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
    void runSave(`delete-match-${match.id}`, 'Match deleted.', async () => { await deleteMatch({ id: match.id, tourId: selectedTour.id }); if (matchForm.id === match.id) resetMatchForm(); return selectedTour.id; });
  };

  const toggleMatchPlayer = (side: 'A' | 'B', playerId: string) => setMatchForm((current) => {
    const ownKey = side === 'A' ? 'sideAPlayerIds' : 'sideBPlayerIds';
    const otherKey = side === 'A' ? 'sideBPlayerIds' : 'sideAPlayerIds';
    const currentOwn = current[ownKey];
    if (currentOwn.includes(playerId)) return { ...current, [ownKey]: currentOwn.filter((id) => id !== playerId) };
    if (current[otherKey].includes(playerId)) return current;
    const maxPlayers = maxPlayersForFormat(current.format);
    if (currentOwn.length >= maxPlayers) return { ...current, [ownKey]: maxPlayers <= 1 ? [playerId] : [...currentOwn.slice(-(maxPlayers - 1)), playerId] };
    return { ...current, [ownKey]: [...currentOwn, playerId] };
  });


  const betFormFromMarket = (market: BetMarket): BetMarketForm => {
    const options = (adminData?.betOptions ?? []).filter((option) => option.marketId === market.id).map((option) => ({ id: option.id, label: option.label, linkedPlayerId: option.linkedPlayerId ?? '', linkedTeamId: option.linkedTeamId ?? '', linkedMatchSide: (option.linkedMatchSide ?? '') as BetOptionForm['linkedMatchSide'], oddsDecimal: option.oddsDecimal === undefined ? '' : String(option.oddsDecimal), sortOrder: String(option.sortOrder) }));
    return { id: market.id, title: market.title, description: market.description ?? '', marketType: market.marketType, marketScope: market.marketScope, status: market.status, required: market.required ?? false, roundId: market.roundId ?? '', matchId: market.matchId ?? '', closesAt: isoToDatetimeLocal(market.closesAt), resultOptionId: market.resultOptionId ?? '', resultText: market.resultText ?? '', options: options.length > 0 ? options : [emptyBetOptionForm(1)] };
  };

  const roundBetLabelFromRound = (round: Round) => `Round ${round.roundNumber}${round.roundDate ? ` (${formatDate(round.roundDate)})` : ''}`;

  const roundBetLabel = (roundId: string) => {
    const round = adminData?.rounds.find((candidate) => candidate.id === roundId);
    return round ? roundBetLabelFromRound(round) : 'tour';
  };

  const replaceBetOptions = (nextForm: BetMarketForm) => {
    if (betMarketForm.id && !window.confirm("Replace this market's options? Options with logged bets cannot be removed by the backend.")) return;
    setBetMarketForm(nextForm);
  };

  const updateBetOption = (index: number, patch: Partial<BetOptionForm>) => setBetMarketForm((current) => ({ ...current, options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }));
  const updateBetOptionPlayer = (index: number, playerId: string) => {
    const player = activePlayers.find((candidate) => candidate.id === playerId);
    setBetMarketForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, linkedPlayerId: playerId, label: option.label || (player ? playerLabel(player) : option.label) } : option),
    }));
  };
  const removeBetOption = (index: number) => setBetMarketForm((current) => ({ ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }));
  const addBetOption = () => setBetMarketForm((current) => ({ ...current, options: [...current.options, emptyBetOptionForm(current.options.length + 1)] }));

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
      status: 'draft',
      required: true,
      matchId: '',
      options: eligiblePlayers.map((player, index) => ({ ...emptyBetOptionForm(index + 1), label: playerLabel(player), linkedPlayerId: player.id })),
    });
  };

  const selectedBetRound = adminData?.rounds.find((round) => round.id === betMarketForm.roundId);
  const selectedBetRoundCloseWarning = roundCutoffWarning(selectedBetRound, adminData?.matches ?? []);

  const setBetMarketRound = (roundId: string) => {
    const round = adminData?.rounds.find((candidate) => candidate.id === roundId);
    setBetMarketForm((current) => ({ ...current, roundId, matchId: '', closesAt: roundCutoffDefault(round, adminData?.matches ?? []) }));
  };

  const setSimpleMarketKind = (kind: 'player_winner' | 'team_winner') => {
    if (kind === 'player_winner') {
      applyStablefordWinnerOptions();
      return;
    }
    const teams = adminData?.tourTeams ?? [];
    replaceBetOptions({
      ...betMarketForm,
      title: betMarketForm.title || `${betMarketForm.roundId ? roundBetLabel(betMarketForm.roundId) : 'Round'} team winner`,
      description: betMarketForm.description || 'Pick the winning team for this round.',
      marketType: 'team_result',
      marketScope: 'general_pot',
      status: 'draft',
      required: true,
      matchId: '',
      options: teams.map((team, index) => ({ ...emptyBetOptionForm(index + 1), label: team.name, linkedTeamId: team.id })),
    });
  };

  const addMissingDefaultPicks = (market: BetMarket) => {
    if (!selectedTour) return;
    const options = (adminData?.betOptions ?? []).filter((option) => option.marketId === market.id);
    const activeMarketBets = (adminData?.bets ?? []).filter((bet) => bet.marketId === market.id && bet.status === 'active');
    const backedPlayerIds = new Set(activeMarketBets.map((bet) => bet.bettorPlayerId).filter(Boolean));
    const missingPlayers = liveTourPlayers.filter((player) => !backedPlayerIds.has(player.id));
    void runSave(`default-bets-${market.id}`, 'Missing default picks added.', async () => {
      for (const player of missingPlayers) {
        let option = options.find((candidate) => market.marketType === 'player_performance' && candidate.linkedPlayerId === player.id);
        if (!option && market.marketType === 'team_result') {
          const teamId = teamIdByPlayer.get(player.id);
          option = options.find((candidate) => candidate.linkedTeamId === teamId);
        }
        if (!option) continue;
        await saveBet({ marketId: market.id, optionId: option.id, bettorName: player.displayName, bettorPlayerId: player.id, stakeAmountPence: 500, comment: 'Default pick added after close', adminNotes: market.marketType === 'team_result' ? 'Admin/system default to own team.' : 'Admin/system default to self.', status: 'active' });
      }
      return selectedTour.id;
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
      status: 'draft',
      required: true,
      matchId: '',
      options: roundTeamIds.map((teamId, index) => ({ ...emptyBetOptionForm(index + 1), label: teamsById.get(teamId)?.name ?? `Team ${index + 1}`, linkedTeamId: teamId })),
    });
  };


  const stablefordOptionsForAttendingPlayers = () => activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player, index) => ({ ...emptyBetOptionForm(index + 1), label: playerLabel(player), linkedPlayerId: player.id }));

  const createStablefordMarketsForRounds = () => {
    if (!selectedTour || !adminData) return;
    const eligibleOptions = stablefordOptionsForAttendingPlayers();
    if (eligibleOptions.length === 0) {
      setSaveState('bet-market', { saving: false, error: 'Add attending players to this tour before creating round player winner markets.' });
      return;
    }
    const missingRounds = adminData.rounds.filter((round) => !adminData.betMarkets.some((market) => market.roundId === round.id && market.marketType === 'player_performance' && market.title.toLowerCase().includes('stableford')));
    if (missingRounds.length === 0) {
      setSaveState('bet-market', { saving: false, success: 'Every round already has a Stableford player market.' });
      return;
    }
    void runSave('bet-market', 'Stableford player markets created for every missing round.', async () => {
      for (const round of missingRounds) {
        await saveBetMarket({
          tourId: selectedTour.id,
          roundId: round.id,
          matchId: null,
          title: `${roundBetLabel(round.id)} stableford winner`,
          description: 'Pick the player with the best Stableford score for this round/day.',
          marketType: 'player_performance',
          marketScope: 'general_pot',
          status: 'draft',
          required: true,
          closesAt: datetimeLocalToIso(roundCutoffDefault(round, adminData?.matches ?? [])),
          resultOptionId: null,
          resultText: null,
          options: eligibleOptions.map((option, index) => ({ id: undefined, label: option.label, linkedPlayerId: option.linkedPlayerId || null, linkedTeamId: null, linkedMatchSide: null, oddsDecimal: null, sortOrder: index + 1 })),
        });
      }
    });
  };

  const saveMarketStatus = (market: BetMarket, status: BetMarket['status']) => {
    if (!selectedTour) return;
    const options = (adminData?.betOptions ?? []).filter((option) => option.marketId === market.id);
    void runSave(`bet-market-status-${market.id}`, `Bet Punto market ${status}.`, async () => {
      await saveBetMarket({ id: market.id, tourId: selectedTour.id, roundId: market.roundId ?? null, matchId: market.matchId ?? null, title: market.title, description: market.description ?? null, marketType: market.marketType, marketScope: market.marketScope, status, closesAt: market.closesAt ?? null, resultOptionId: market.resultOptionId ?? null, resultText: market.resultText ?? null, required: market.required ?? false, options: options.map((option) => ({ id: option.id, label: option.label, linkedPlayerId: option.linkedPlayerId ?? null, linkedTeamId: option.linkedTeamId ?? null, linkedMatchSide: option.linkedMatchSide ?? null, oddsDecimal: option.oddsDecimal ?? null, sortOrder: option.sortOrder })) });
      return selectedTour.id;
    });
  };

  const removeBetMarket = (market: BetMarket) => {
    if (!selectedTour) return;
    const marketBets = (adminData?.bets ?? []).filter((bet) => bet.marketId === market.id);
    if (!window.confirm(`Delete ${market.title}? This removes the market, its options and ${marketBets.length} logged bet${marketBets.length === 1 ? '' : 's'}.`)) return;
    void runSave(`delete-bet-market-${market.id}`, 'Bet Punto market deleted.', async () => { await deleteBetMarket({ id: market.id, tourId: selectedTour.id }); if (betMarketForm.id === market.id) setBetMarketForm(emptyBetMarketForm); return selectedTour.id; });
  };

  const resetSelectedTourBetPunto = () => {
    if (!selectedTour) return;
    void runSave('reset-bet-punto-tour', 'Bet Punto reset for this tour.', async () => {
      await resetBetPuntoTour({ tourId: selectedTour.id, confirmation: betPuntoResetConfirmation, forceCurrent: betPuntoResetForceCurrent });
      setBetPuntoResetConfirmation('');
      setBetPuntoResetForceCurrent(false);
      setBetMarketForm(emptyBetMarketForm);
      return selectedTour.id;
    });
  };

  const submitBetMarket = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('bet-market', 'Bet Punto market saved.', async () => { await saveBetMarket({ ...betMarketForm, tourId: selectedTour.id, roundId: betMarketForm.roundId || null, matchId: betMarketForm.matchId || null, closesAt: datetimeLocalToIso(betMarketForm.closesAt), resultOptionId: betMarketForm.resultOptionId || null, resultText: betMarketForm.resultText || null, required: betMarketForm.required, options: betMarketForm.options.map((option, index) => ({ id: option.id, label: option.label, linkedPlayerId: option.linkedPlayerId || null, linkedTeamId: option.linkedTeamId || null, linkedMatchSide: option.linkedMatchSide || null, oddsDecimal: option.oddsDecimal === '' ? null : Number(option.oddsDecimal), sortOrder: Number(option.sortOrder) || index + 1 })) }); setBetMarketForm(emptyBetMarketForm); }); };

  const submitResultEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTour || !resultMatch) return;
    const resultText = normalizeMatchplayResult(resultForm.resultText);
    if (!resultText) { setSaveState('result-entry', { saving: false, error: 'Choose a valid matchplay result.' }); return; }
    const winningSide = resultText === 'AS' ? 'halved' : resultForm.winningSide;
    const sideATeamName = teamsById.get(resultMatch.sideATeamId)?.name ?? 'the first team';
    const sideBTeamName = teamsById.get(resultMatch.sideBTeamId)?.name ?? 'the second team';
    if (resultText !== 'AS' && !winningSide) { setSaveState('result-entry', { saving: false, error: `Choose ${sideATeamName} or ${sideBTeamName} as the winner.` }); return; }
    const { pointsSideA, pointsSideB } = deriveMatchPoints(winningSide, resultMatch.pointsAvailable || 1);
    void runSave('result-entry', resultMatch.status === 'complete' ? 'Result corrected.' : 'Result submitted.', async () => {
      await submitResult({
        tourId: selectedTour.id,
        matchId: resultMatch.id,
        pointsSideA,
        pointsSideB,
        resultText,
        published: resultForm.published,
        correctionReason: resultForm.correctionReason || null,
      });
      return selectedTour.id;
    });
  };


  const submitHandbookSection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTour) return;
    const sortOrder = Number(handbookForm.sortOrder);
    if (!handbookForm.sectionKey.trim() || !handbookForm.title.trim()) {
      setSaveState('handbook-section', { saving: false, error: 'Add a section key and title.' });
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      setSaveState('handbook-section', { saving: false, error: 'Sort order must be numeric.' });
      return;
    }
    void runSave('handbook-section', 'Handbook section saved.', async () => {
      await saveHandbookSection({ id: handbookForm.id, tourId: selectedTour.id, sectionKey: handbookForm.sectionKey.trim(), title: handbookForm.title.trim(), body: handbookForm.body || null, sortOrder });
      setHandbookForm(emptyHandbookForm);
      return selectedTour.id;
    });
  };

  const removeHandbookSection = (sectionId: string) => {
    if (!selectedTour || !window.confirm('Delete this handbook section?')) return;
    void runSave(`delete-handbook-${sectionId}`, 'Handbook section deleted.', async () => {
      await deleteHandbookSection({ id: sectionId, tourId: selectedTour.id });
      return selectedTour.id;
    });
  };

  const settleMarketWithWinner = (market: BetMarket, resultOptionId: string) => {
    if (!resultOptionId) return;
    void runSave(`bet-market-settle-${market.id}`, 'Bet Punto market settled.', async () => {
      await settleBetMarket({ marketId: market.id, resultOptionId, settlementNote: market.resultText ?? null, correction: market.status === 'settled' });
      return selectedTourId;
    });
  };

  const settleSelectedBetMarket = () => {
    if (!betMarketForm.id || !betMarketForm.resultOptionId) {
      setSaveState('bet-market-settle', { saving: false, error: 'Choose a saved market and result option before settlement.' });
      return;
    }
    const marketId = betMarketForm.id;
    const resultOptionId = betMarketForm.resultOptionId;
    void runSave('bet-market-settle', 'Bet Punto market settled.', async () => {
      await settleBetMarket({ marketId, resultOptionId, settlementNote: betMarketForm.resultText || null, correction: selectedBetMarket?.status === 'settled' });
      return selectedTourId;
    });
  };


  const submitAdminBet = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedBetMarket) return; const stakeAmountPence = Math.round(Number(adminBetForm.stake) * 100); void runSave('admin-bet', 'Bet override saved.', async () => { await saveBet({ id: adminBetForm.id, marketId: selectedBetMarket.id, optionId: adminBetForm.optionId, bettorName: adminBetForm.bettorName, bettorPlayerId: adminBetForm.bettorPlayerId || null, stakeAmountPence, comment: adminBetForm.comment || null, adminNotes: adminBetForm.adminNotes || null, status: adminBetForm.status }); setAdminBetForm(emptyAdminBetForm); }); };

  const startAdminBetEdit = (bet: Bet) => setAdminBetForm({ id: bet.id, optionId: bet.optionId, bettorName: bet.bettorName, bettorPlayerId: bet.bettorPlayerId ?? '', stake: String(((bet.stakeAmountPence ?? 0) / 100).toFixed(2)), comment: bet.comment ?? '', adminNotes: bet.adminNotes ?? '', status: bet.status });

  const updateBetStatus = (bet: Bet, nextStatus: Bet['status']) => { void runSave(`bet-${bet.id}`, 'Bet updated.', async () => { await updateBet({ id: bet.id, status: nextStatus, outcomeStatus: nextStatus === 'void' ? 'void' : (bet.outcomeStatus === 'void' ? 'pending' : bet.outcomeStatus), payoutStatus: nextStatus === 'void' ? 'not_applicable' : bet.payoutStatus, payoutAmountPence: nextStatus === 'void' ? null : (bet.payoutAmountPence ?? null), payoutNotes: bet.payoutNotes ?? null }); }); };

  const updateBetOutcome = (bet: Bet, outcomeStatus: Bet['outcomeStatus']) => { void runSave(`bet-${bet.id}`, 'Bet outcome updated.', async () => { await updateBet({ id: bet.id, status: outcomeStatus === 'void' ? 'void' : 'active', outcomeStatus, payoutStatus: 'not_applicable', payoutAmountPence: outcomeStatus === 'won' ? (bet.payoutAmountPence ?? null) : null, payoutNotes: bet.payoutNotes ?? null }); }); };

  const promptBetPayout = (bet: Bet) => {
    const amountText = window.prompt('Calculated return in pounds (blank to clear)', bet.payoutAmountPence === undefined ? '' : String(bet.payoutAmountPence / 100));
    if (amountText === null) return;
    const notes = window.prompt('Calculated returns (optional)', bet.payoutNotes ?? '');
    const trimmed = amountText.trim();
    const payoutAmountPence = trimmed === '' ? null : Math.round(Number(trimmed.replace(/^£/, '')) * 100);
    if (payoutAmountPence !== null && (!Number.isFinite(payoutAmountPence) || payoutAmountPence < 0)) {
      setSaveState(`bet-${bet.id}`, { saving: false, error: 'Calculated return must be blank or a zero-or-greater amount.' });
      return;
    }
    void runSave(`bet-${bet.id}`, 'Calculated return updated.', async () => { await updateBet({ id: bet.id, status: bet.status, outcomeStatus: bet.outcomeStatus, payoutStatus: 'not_applicable', payoutAmountPence, payoutNotes: notes || null }); });
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
        {activeTab === 'Overview' ? <section className="card admin-panel"><p className="eyebrow">Overview</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{selectedTour ? <p>{selectedTour.location ?? 'Location TBC'} · {formatDate(selectedTour.startDate)} — {formatDate(selectedTour.endDate)} · {selectedTour.status}</p> : <p>No tour has been added yet.</p>}<div className="stat-grid"><Stat label="Active players" value={activePlayers.length} /><Stat label="Inactive players" value={inactivePlayers.length} /><Stat label="Attending" value={attendingPlayerIds.size} /><Stat label="Teams" value={adminData.tourTeams.length} /><Stat label="Assigned attending" value={assignedPlayerIds.size} /><Stat label="Attending unassigned" value={attendingUnassigned.length} /><Stat label="Rounds" value={adminData.rounds.length} /><Stat label="Draft matches" value={draftMatches} /><Stat label="Published matches" value={publishedMatches} /><Stat label="Complete matches" value={completeMatches} /><Stat label="Published rounds" value={adminData.rounds.filter((round) => round.published).length} /></div></section> : null}

        {activeTab === 'Tour setup' ? <section className="card admin-panel"><p className="eyebrow">Tour lifecycle</p><h3>Edit or create annual tours</h3><p>Archiving or completing a tour does not delete historic matches, results or stats. <strong>Current public</strong> is the single tour the public app reads; planned future tours stay private until you explicitly set them current public and publish their rounds/rosters.</p><div className="chip-list">{adminData.tours.map((tour) => <span className="admin-inline-actions" key={tour.id}><button className={`pill ${selectedTour?.id === tour.id ? 'selected' : ''}`} type="button" onClick={() => void loadAdminData(tour.id)}>{tour.name} · {tour.status}{tour.isCurrentPublic ? ' · current public' : ''}</button><button className="pill" type="button" onClick={() => publishCurrentTour(tour)} disabled={tour.isCurrentPublic}>Set current public</button>{states[`current-public-tour-${tour.id}`]?.error ? <span className="form-error">{states[`current-public-tour-${tour.id}`]?.error}</span> : null}</span>)}</div><div className="chip-list"><button className="pill" type="button" onClick={() => setTourForm(emptyTourForm())}>Create new tour</button><button className="pill" type="button" onClick={() => { const nextYear = Math.max(new Date().getFullYear(), ...adminData.tours.map((tour) => tour.year)) + 1; setTourForm({ name: `Roegusta Tour ${nextYear}`, year: String(nextYear), status: 'planned', location: '', startDate: '', endDate: '', description: '' }); }}>Create next tour</button></div><form className="admin-form-grid" onSubmit={submitTour}><label>Name<input value={tourForm.name} onChange={(event) => setTourForm({ ...tourForm, name: event.target.value })} /></label><label>Year<input value={tourForm.year} onChange={(event) => setTourForm({ ...tourForm, year: event.target.value })} inputMode="numeric" /></label><label>Location<input value={tourForm.location} onChange={(event) => setTourForm({ ...tourForm, location: event.target.value })} /></label><label>Start date<input value={tourForm.startDate} onChange={(event) => setTourForm({ ...tourForm, startDate: event.target.value })} type="date" /></label><label>End date<input value={tourForm.endDate} onChange={(event) => setTourForm({ ...tourForm, endDate: event.target.value })} type="date" /></label><label>Status<select value={tourForm.status} onChange={(event) => setTourForm({ ...tourForm, status: event.target.value as Tour['status'] })}><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label><label className="admin-full-span">Description<textarea value={tourForm.description} onChange={(event) => setTourForm({ ...tourForm, description: event.target.value })} /></label><SaveButton state={states.tour} label={tourForm.id ? 'Save tour' : 'Create tour'} />{tourForm.id ? <SaveButton state={states['delete-tour']} label="Delete test tour" onClick={removeSelectedTour} /> : null}</form></section> : null}

        {activeTab === 'Player library' ? <section className="card admin-panel"><p className="eyebrow">Player library</p><h3>Permanent players</h3><form className="admin-form-grid" onSubmit={submitPlayer}><p className="admin-full-span">Create a new player here. Existing players edit inline in the list below so you stay near the selected player.</p><label>Display name<input value={playerForm.displayName} onChange={(event) => setPlayerForm({ ...playerForm, displayName: event.target.value })} /></label><label>Nickname<input value={playerForm.nickname} onChange={(event) => setPlayerForm({ ...playerForm, nickname: event.target.value })} /></label><label>Initials<input value={playerForm.initials} onChange={(event) => setPlayerForm({ ...playerForm, initials: event.target.value })} /></label><label>Photo URL<input value={playerForm.photoUrl} onChange={(event) => setPlayerForm({ ...playerForm, photoUrl: event.target.value })} /></label><label className="admin-full-span">Tour profile / bio<textarea value={playerForm.profileBio} onChange={(event) => setPlayerForm({ ...playerForm, profileBio: event.target.value })} /></label><label>Active<select value={playerForm.active ? 'yes' : 'no'} onChange={(event) => setPlayerForm({ ...playerForm, active: event.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></label><SaveButton state={states.player} label="Create player" /></form><div className="admin-card-list">{adminData.players.map((player) => <article className="admin-mini-card" key={player.id}><div><strong>{player.displayName}</strong><span>{player.active ? 'Active' : 'Inactive'}{player.initials ? ` · ${player.initials}` : ''}{player.nickname ? ` · ${player.nickname}` : ''}{player.photoUrl ? ' · photo' : ''}{player.profileBio ? ' · profile' : ''}</span>{inlinePlayerForm?.id === player.id ? <form className="admin-form-grid inline-edit-card" onSubmit={submitInlinePlayer}><label>Display name<input value={inlinePlayerForm.displayName} onChange={(event) => setInlinePlayerForm({ ...inlinePlayerForm, displayName: event.target.value })} /></label><label>Nickname<input value={inlinePlayerForm.nickname} onChange={(event) => setInlinePlayerForm({ ...inlinePlayerForm, nickname: event.target.value })} /></label><label>Initials<input value={inlinePlayerForm.initials} onChange={(event) => setInlinePlayerForm({ ...inlinePlayerForm, initials: event.target.value })} /></label><label>Photo URL<input value={inlinePlayerForm.photoUrl} onChange={(event) => setInlinePlayerForm({ ...inlinePlayerForm, photoUrl: event.target.value })} /></label><label className="admin-full-span">Tour profile / bio<textarea value={inlinePlayerForm.profileBio} onChange={(event) => setInlinePlayerForm({ ...inlinePlayerForm, profileBio: event.target.value })} /></label><label>Active<select value={inlinePlayerForm.active ? 'yes' : 'no'} onChange={(event) => setInlinePlayerForm({ ...inlinePlayerForm, active: event.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></label><SaveButton state={states[`player-${player.id}`]} label="Save player" /><button type="button" onClick={() => setInlinePlayerForm(null)}>Cancel</button></form> : null}</div><button type="button" onClick={() => setInlinePlayerForm({ id: player.id, displayName: player.displayName, nickname: player.nickname ?? '', initials: player.initials ?? '', photoUrl: player.photoUrl ?? '', profileBio: player.profileBio ?? '', active: player.active })}>Edit</button></article>)}</div></section> : null}

        {activeTab === 'Squads & teams' ? <section className="card admin-panel"><p className="eyebrow">Squads & teams</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{!selectedTour ? <p>No tour is available.</p> : <><form className="admin-form-grid" onSubmit={submitTeam}>{teamForm.id ? <p className="admin-full-span form-success">Editing team: {teamForm.name}</p> : null}<label>Team name<input value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></label><label>Colour<input value={teamForm.colour} onChange={(event) => setTeamForm({ ...teamForm, colour: event.target.value })} /></label><label>Captain<select value={teamForm.captainPlayerId} onChange={(event) => setTeamForm({ ...teamForm, captainPlayerId: event.target.value })}><option value="">No captain</option>{activePlayers.map((player) => <option value={player.id} key={player.id}>{playerLabel(player)}</option>)}</select></label><label>Sort order<input value={teamForm.sortOrder} onChange={(event) => setTeamForm({ ...teamForm, sortOrder: event.target.value })} inputMode="numeric" /></label><SaveButton state={states.team} label={teamForm.id ? 'Save team' : 'Create team'} />{teamForm.id ? <button type="button" onClick={() => setTeamForm(emptyTeamForm)}>Cancel team edit</button> : null}</form><div className="premium-inset"><p className="eyebrow">Bulk attendance</p><h4>Tick everyone first, then save once</h4>{attendanceChanges.length > 0 ? <p className="form-success">{attendanceChanges.length} unsaved attendance change{attendanceChanges.length === 1 ? '' : 's'}.</p> : <p>No unsaved attendance changes.</p>}<div className="admin-card-list compact-admin-list">{activePlayers.map((player) => { const draft = attendanceDrafts[player.id] ?? { attending: false, tourHandicap: '', notes: '', nickname: '', photoUrl: '', profileBio: '', teamId: '' }; const changed = attendanceChanges.some((candidate) => candidate.id === player.id); const protectedWarning = !draft.attending && matchParticipantIds.has(player.id); return <article className={`admin-mini-card attendance-card ${changed ? 'unsaved-card' : ''}`} key={player.id}><div><strong>{playerLabel(player)}</strong><label className="publish-toggle"><input type="checkbox" checked={draft.attending} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, attending: event.target.checked, teamId: event.target.checked ? draft.teamId : '' } })} /> Attending</label>{changed ? <span className="form-success">Unsaved</span> : null}{protectedWarning ? <span className="form-error">Player appears in published/complete matches; attendance change will not delete historic match data.</span> : null}</div><label>Tour handicap<input value={draft.tourHandicap} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, tourHandicap: event.target.value } })} inputMode="decimal" /></label><label>Notes<input value={draft.notes} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, notes: event.target.value } })} /></label><details className="admin-full-span"><summary>Tour-specific public profile override</summary><div className="admin-form-grid"><label>Tour nickname<input value={draft.nickname} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, nickname: event.target.value } })} placeholder={player.nickname ?? 'Global nickname fallback'} /></label><label>Tour photo URL<input value={draft.photoUrl} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, photoUrl: event.target.value } })} placeholder="Supabase Storage public URL preferred" /></label><label className="admin-full-span">Tour profile / bio<textarea value={draft.profileBio} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, profileBio: event.target.value } })} placeholder={player.profileBio ?? 'Global profile fallback'} /></label><small className="admin-full-span">Use Supabase Storage bucket player-photos with stable ID paths such as player-photos/&lt;player_id&gt;/profile.jpg or player-photos/&lt;tour_id&gt;/&lt;player_id&gt;/profile.jpg, then paste the public URL here.</small></div></details></article>; })}</div><SaveButton state={states['attendance-bulk']} label={`Save attendance changes${attendanceChanges.length ? ` (${attendanceChanges.length})` : ''}`} onClick={saveAttendanceChanges} /></div><div className="premium-inset"><p className="eyebrow">Bulk team assignment</p><h4>Assign attending players, then save once</h4><div className="team-assignment-board"><AssignmentColumn title="Unassigned" count={unassignedAssignableCount}>{assignablePlayers.filter((player) => !attendanceDrafts[player.id]?.teamId).map((player) => <PlayerAssignmentChip key={player.id} player={player} teams={adminData.tourTeams} currentTeamId="" onAssign={assignPlayerDraftTeam} />)}</AssignmentColumn>{teamAssignmentCounts.map(({ team, count }) => <AssignmentColumn title={team.name} count={count} key={team.id}>{assignablePlayers.filter((player) => attendanceDrafts[player.id]?.teamId === team.id).map((player) => <PlayerAssignmentChip key={player.id} player={player} teams={adminData.tourTeams} currentTeamId={team.id} onAssign={assignPlayerDraftTeam} />)}</AssignmentColumn>)}</div><details><summary>Absent or inactive players are not assignable</summary><div className="chip-list">{[...notAttending, ...inactivePlayers].map((player) => <span className="pill" key={player.id}>{playerLabel(player)}</span>)}</div></details>{teamAssignmentChanged ? <p className="form-success">Unsaved team assignment changes.</p> : <p>No unsaved team assignment changes.</p>}<SaveButton state={states['team-assignments']} label="Save team assignments" onClick={saveTeamAssignments} /></div><div className="admin-card-list">{adminData.tourTeams.map((team) => <article className="admin-mini-card team-card" key={team.id}><div><strong>{team.name}</strong><span>{team.colour ?? 'Colour TBC'} · Sort {team.sortOrder}{team.captainPlayerId ? ` · Captain ${playerLabel(playersById.get(team.captainPlayerId))}` : ''} · {team.published ? 'Roster public' : 'Roster private'}</span><div className="chip-list">{assignablePlayers.filter((player) => attendanceDrafts[player.id]?.teamId === team.id).map((player) => <span className="pill" key={player.id}>{playerLabel(player)}</span>)}</div></div><button type="button" onClick={() => toggleTeamPublished(team)}>{team.published ? 'Unpublish roster' : 'Publish roster'}</button>{states[`team-published-${team.id}`]?.error ? <span className="form-error">{states[`team-published-${team.id}`]?.error}</span> : null}<button type="button" onClick={() => { setTeamForm({ id: team.id, name: team.name, colour: team.colour ?? '', captainPlayerId: team.captainPlayerId ?? '', sortOrder: String(team.sortOrder) }); scrollAdminPanelTop(); }}>Edit team</button><button type="button" onClick={() => removeTeam(team)}>Delete unused team</button>{states[`delete-team-${team.id}`]?.error ? <span className="form-error">{states[`delete-team-${team.id}`]?.error}</span> : null}</article>)}</div></>}</section> : null}

        {activeTab === 'Rounds & tee times' ? <section className="card admin-panel"><p className="eyebrow">Rounds & tee times</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{!selectedTour ? <p>No tour is available.</p> : <><div className="chip-list"><button className="pill" type="button" onClick={() => setRoundForm({ ...emptyRoundForm({ id: '', tourId: selectedTour.id, roundNumber: adminData.rounds.length + 1, name: `Round ${adminData.rounds.length + 1}`, status: 'draft' }), id: undefined })}>New round</button></div><div className="premium-inset"><p className="eyebrow">Tour round setup</p><div className="admin-form-grid"><label>Number of rounds<select value={roundPlanForm.count} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, count: event.target.value })}>{roundCountOptions.map((count) => <option value={count} key={count}>{count}</option>)}</select></label><label>Name prefix<input value={roundPlanForm.namePrefix} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, namePrefix: event.target.value })} /></label><label>Default course<input value={roundPlanForm.courseName} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, courseName: event.target.value })} /></label><label>Default format<select value={roundPlanForm.format} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, format: event.target.value as MatchFormat })}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Status<select value={roundPlanForm.status} onChange={(event) => setRoundPlanForm({ ...roundPlanForm, status: event.target.value as Round['status'] })}><option value="draft">Draft</option><option value="planned">Planned</option><option value="active">Active</option></select></label><SaveButton state={states['plan-rounds']} label="Save round setup" onClick={planRounds} /><SaveButton state={states['publish-tour-content']} label="Publish all rosters, rounds and matches" onClick={publishCurrentTourContent} /></div><small>Increasing the count creates missing round rows only. Existing dates, courses, formats, tee times, statuses and notes are preserved. Reducing the count never deletes rounds automatically; use safe Delete buttons on surplus draft/planned rounds.</small></div><label>Edit round<select value={roundForm.id ?? ''} onChange={(event) => { const round = adminData.rounds.find((candidate) => candidate.id === event.target.value); setRoundForm(emptyRoundForm(round)); }}><option value="">New unsaved round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>Round {round.roundNumber}: {round.name}{round.roundDate ? ` · ${formatDate(round.roundDate)}` : ''}</option>)}</select></label><form className="admin-form-grid" onSubmit={submitRound}><label>Round number<input value={roundForm.roundNumber} onChange={(event) => setRoundForm({ ...roundForm, roundNumber: event.target.value })} inputMode="numeric" /></label><label>Name<input value={roundForm.name} onChange={(event) => setRoundForm({ ...roundForm, name: event.target.value })} /></label><label>Date<input value={roundForm.roundDate} onChange={(event) => setRoundForm({ ...roundForm, roundDate: event.target.value })} type="date" /></label><label>Day/session<select value={roundForm.session} onChange={(event) => setRoundForm({ ...roundForm, session: event.target.value as RoundForm['session'] })}>{roundSessionOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label><label>Exact tee time<input value={roundForm.teeTime} onChange={(event) => setRoundForm({ ...roundForm, teeTime: event.target.value })} type="time" /></label><label>Course<input value={roundForm.courseName} onChange={(event) => setRoundForm({ ...roundForm, courseName: event.target.value })} /></label><label>Format<select value={roundForm.format} onChange={(event) => setRoundForm({ ...roundForm, format: event.target.value as MatchFormat })}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Status<select value={roundForm.status} onChange={(event) => setRoundForm({ ...roundForm, status: event.target.value as Round['status'] })}><option value="draft">Draft</option><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option></select></label><label className="admin-full-span">Notes<textarea value={roundForm.notes} onChange={(event) => setRoundForm({ ...roundForm, notes: event.target.value })} /></label><SaveButton state={states.round} label={roundForm.id ? 'Save selected round' : 'Create round'} />{roundForm.id ? <SaveButton state={states['delete-round']} label="Delete safe round" onClick={() => removeRound()} /> : null}</form><div className="admin-card-list">{adminData.rounds.length === 0 ? <p>No rounds have been added yet.</p> : adminData.rounds.map((round) => { const noteParts = splitRoundNotes(round.notes); return <article className="admin-mini-card" key={round.id}><div><strong>Round {round.roundNumber}: {round.name}</strong><span>{formatDate(round.roundDate)} · {noteParts.session}{round.teeTime ? ` · ${round.teeTime}` : ''}</span><span>{round.courseName ?? 'Course TBC'} · {round.formatLabel ?? 'Format TBC'} · {round.status} · {round.published ? 'public' : 'private'}</span></div><button type="button" onClick={() => toggleRoundPublished(round)}>{round.published ? 'Unpublish round' : 'Publish round'}</button>{states[`round-published-${round.id}`]?.error ? <span className="form-error">{states[`round-published-${round.id}`]?.error}</span> : null}<button type="button" onClick={() => { setRoundForm(emptyRoundForm(round)); scrollAdminPanelTop(); }}>Edit</button>{round.status === 'draft' || round.status === 'planned' ? <button type="button" onClick={() => removeRound(round)}>Delete</button> : null}</article>; })}</div></>}</section> : null}

        {activeTab === 'Matches & pairings' ? <section className="card admin-panel"><p className="eyebrow">Matches & pairings</p><h3>Draft and publish pairings</h3>{!selectedTour ? <p>No tour is available.</p> : adminData.rounds.length === 0 ? <p>No rounds have been added yet.</p> : <><label>Round<select value={matchForm.roundId} onChange={(event) => { const round = adminData.rounds.find((candidate) => candidate.id === event.target.value); setMatchForm(emptyMatchForm(round, undefined, String(nextAvailableMatchNumber(round?.id ?? '', adminData.matches)))); }}><option value="">Choose round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select></label><div className="premium-inset"><p className="eyebrow">Sequential tee times</p><div className="admin-form-grid"><label>First tee time<input value={teeTimePlanForm.firstTeeTime} placeholder="08:10 or 9:00" onChange={(event) => setTeeTimePlanForm({ ...teeTimePlanForm, firstTeeTime: event.target.value })} /></label><label>Interval minutes<input value={teeTimePlanForm.intervalMinutes} inputMode="numeric" onChange={(event) => setTeeTimePlanForm({ ...teeTimePlanForm, intervalMinutes: event.target.value })} /></label><SaveButton state={states['tee-time-plan']} label="Apply to draft/planned matches" onClick={applySequentialTeeTimes} /></div><small>Applies to existing draft/planned matches in this round by match number. H:mm, HH:mm and TBC remain valid on individual matches.</small></div><form className="admin-form-grid" onSubmit={submitMatch}><label>Match number<input value={matchForm.matchNumber} onChange={(event) => setMatchForm({ ...matchForm, matchNumber: event.target.value })} inputMode="numeric" /></label><label>Format<select value={matchForm.format} onChange={(event) => { const format = event.target.value as MatchFormat; const maxPlayers = maxPlayersForFormat(format); setMatchForm({ ...matchForm, format, sideAPlayerIds: matchForm.sideAPlayerIds.slice(0, maxPlayers), sideBPlayerIds: matchForm.sideBPlayerIds.slice(0, maxPlayers) }); }}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Side A team<select value={matchForm.sideATeamId} onChange={(event) => { const sideATeamId = event.target.value; setMatchForm({ ...matchForm, sideATeamId, sideAPlayerIds: matchForm.sideAPlayerIds.filter((playerId) => !sideATeamId || teamIdByPlayer.get(playerId) === sideATeamId) }); }}><option value="">Choose team</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Side B team<select value={matchForm.sideBTeamId} onChange={(event) => { const sideBTeamId = event.target.value; setMatchForm({ ...matchForm, sideBTeamId, sideBPlayerIds: matchForm.sideBPlayerIds.filter((playerId) => !sideBTeamId || teamIdByPlayer.get(playerId) === sideBTeamId) }); }}><option value="">Choose team</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><div><p className="eyebrow">Points</p><strong>1 point</strong><small>Every match is worth one point.</small></div><label>Tee time<input value={matchForm.teeTime} onChange={(event) => setMatchForm({ ...matchForm, teeTime: event.target.value })} /></label><label>Status<select value={matchForm.status === 'void' ? 'void' : 'planned'} onChange={(event) => setMatchForm({ ...matchForm, status: event.target.value as Match['status'] })}><option value="planned">Planned</option><option value="void">Void</option></select></label><label className="publish-toggle"><input type="checkbox" checked={matchForm.published} onChange={(event) => setMatchForm({ ...matchForm, published: event.target.checked })} /> Published publicly</label><label>Side B label<input value={matchForm.sideBLabel} onChange={(event) => setMatchForm({ ...matchForm, sideBLabel: event.target.value })} /></label><div><p className="eyebrow">Side A players</p><small>{matchForm.format === 'custom' ? 'Custom format allows flexible side sizes.' : `Choose up to ${matchMaxPlayers} player${matchMaxPlayers === 1 ? '' : 's'}.`}</small><div className="chip-list">{activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player) => { const selected = matchForm.sideAPlayerIds.includes(player.id); const onOtherSide = matchForm.sideBPlayerIds.includes(player.id); const wrongTeam = Boolean(matchForm.sideATeamId && teamIdByPlayer.get(player.id) !== matchForm.sideATeamId); const alreadyBooked = bookedPlayerIdsForRound.has(player.id); const unavailable = onOtherSide || wrongTeam || alreadyBooked; const handicap = tourPlayers.find((tourPlayer) => tourPlayer.playerId === player.id)?.tourHandicap; return <button className={`pill match-player-pill ${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`} type="button" onClick={() => toggleMatchPlayer('A', player.id)} disabled={unavailable} aria-pressed={selected} title={onOtherSide ? 'Already selected for Side B' : alreadyBooked ? 'Already selected for another match in this round' : wrongTeam ? 'Player is not assigned to the Side A team' : undefined} key={player.id}>{playerLabel(player)}{handicap !== undefined ? ` · Hcp ${handicap}` : ''}{onOtherSide ? ' · Side B' : alreadyBooked ? ' · booked' : wrongTeam ? ' · unavailable' : ''}</button>; })}</div>{noEligibleSideAPlayers ? <p className="form-error">No eligible Side A players remain for this round.</p> : null}</div><div><p className="eyebrow">Side B players</p><small>{matchForm.format === 'custom' ? 'Custom format allows flexible side sizes.' : `Choose up to ${matchMaxPlayers} player${matchMaxPlayers === 1 ? '' : 's'}.`}</small><div className="chip-list">{activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player) => { const selected = matchForm.sideBPlayerIds.includes(player.id); const onOtherSide = matchForm.sideAPlayerIds.includes(player.id); const wrongTeam = Boolean(matchForm.sideBTeamId && teamIdByPlayer.get(player.id) !== matchForm.sideBTeamId); const alreadyBooked = bookedPlayerIdsForRound.has(player.id); const unavailable = onOtherSide || wrongTeam || alreadyBooked; const handicap = tourPlayers.find((tourPlayer) => tourPlayer.playerId === player.id)?.tourHandicap; return <button className={`pill match-player-pill ${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`} type="button" onClick={() => toggleMatchPlayer('B', player.id)} disabled={unavailable} aria-pressed={selected} title={onOtherSide ? 'Already selected for Side A' : alreadyBooked ? 'Already selected for another match in this round' : wrongTeam ? 'Player is not assigned to the Side B team' : undefined} key={player.id}>{playerLabel(player)}{handicap !== undefined ? ` · Hcp ${handicap}` : ''}{onOtherSide ? ' · Side A' : alreadyBooked ? ' · booked' : wrongTeam ? ' · unavailable' : ''}</button>; })}</div>{noEligibleSideBPlayers ? <p className="form-error">No eligible Side B players remain for this round.</p> : null}</div><p className="admin-full-span match-summary"><strong>Match {matchForm.matchNumber || 'TBC'}:</strong> {matchSideALabel} v {matchSideBLabel}</p><label className="admin-full-span">Notes<textarea value={matchForm.notes} onChange={(event) => setMatchForm({ ...matchForm, notes: event.target.value })} /></label><SaveButton state={states.match} label={matchForm.id ? 'Save match changes' : 'Create match'} />{matchForm.id ? <button type="button" onClick={resetMatchForm}>Create new match / cancel edit</button> : null}</form><div className="chip-list"><SaveButton state={states['publish-round-matches']} label="Publish all matches for this round" onClick={publishRoundMatches} /></div><div className="admin-card-list">{roundMatches.length === 0 ? <p>No matches have been added for this round yet.</p> : roundMatches.map((match) => <article className="admin-mini-card" key={match.id}><div><strong>{matchTitle(match)}</strong><span>{match.format} · {match.status} · {match.published ? 'Published' : 'Draft/unpublished'} · 1 pt{match.teeTime ? ` · Tee ${formatTeeTimeDisplay(match.teeTime)}` : ''}{match.status === 'complete' ? ` · ${match.pointsSideA ?? 0}-${match.pointsSideB ?? 0}` : ''}</span></div><button type="button" onClick={() => { const participants = adminData.matchParticipants.filter((participant) => participant.matchId === match.id); setMatchForm({ ...emptyMatchForm(selectedMatchRound, match), sideAPlayerIds: participants.filter((participant) => participant.side === 'A').map((participant) => participant.playerId), sideBPlayerIds: participants.filter((participant) => participant.side === 'B').map((participant) => participant.playerId) }); }}>Edit</button>{match.status !== 'complete' ? <button type="button" onClick={() => removeMatch(match)}>Delete draft match</button> : null}{states[`delete-match-${match.id}`]?.error ? <span className="form-error">{states[`delete-match-${match.id}`]?.error}</span> : null}</article>)}</div></>}</section> : null}


        {activeTab === 'Result entry' ? <section className="card admin-panel"><p className="eyebrow">Result entry</p><h3>Submit or correct match results</h3>{!selectedTour ? <p>No tour is available.</p> : adminData.rounds.length === 0 ? <p>No rounds are available.</p> : <><form className="admin-form-grid" onSubmit={submitResultEntry}><label>Round<select value={resultRound?.id ?? ''} onChange={(event) => { const round = adminData.rounds.find((candidate) => candidate.id === event.target.value); const firstMatch = adminData.matches.find((match) => match.roundId === round?.id); setResultForm({ ...emptyResultForm, roundId: round?.id ?? '', matchId: firstMatch?.id ?? '', resultText: firstMatch?.resultText ?? '', winningSide: firstMatch?.winningSide === 'A' || firstMatch?.winningSide === 'B' ? firstMatch.winningSide : '', published: firstMatch?.published ?? true }); }}><option value="">Choose round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select></label><label>Match<select value={resultMatch?.id ?? ''} onChange={(event) => { const match = adminData.matches.find((candidate) => candidate.id === event.target.value); setResultForm({ ...resultForm, matchId: match?.id ?? '', resultText: match?.resultText ?? '', winningSide: match?.winningSide === 'A' || match?.winningSide === 'B' ? match.winningSide : '', published: match?.published ?? true }); }}><option value="">Choose match</option>{resultMatches.map((match) => <option value={match.id} key={match.id}>Match {match.matchNumber}: {teamsById.get(match.sideATeamId)?.name ?? 'First team'} v {teamsById.get(match.sideBTeamId)?.name ?? 'Second team'}{match.status === 'complete' ? ' · complete' : ''}</option>)}</select></label><label>Result margin<select value={resultForm.resultText} onChange={(event) => { const resultText = event.target.value; setResultForm({ ...resultForm, resultText, winningSide: resultText === 'AS' ? '' : resultForm.winningSide }); }}><option value="">Choose result</option>{resultOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label><label>Winner<select value={resultForm.winningSide} disabled={resultForm.resultText === 'AS'} onChange={(event) => setResultForm({ ...resultForm, winningSide: event.target.value as ResultForm['winningSide'] })}><option value="">{resultForm.resultText === 'AS' ? 'Halved match' : 'Choose winner'}</option><option value="A">{teamsById.get(resultMatch?.sideATeamId ?? '')?.name ?? 'First team'}</option><option value="B">{teamsById.get(resultMatch?.sideBTeamId ?? '')?.name ?? 'Second team'}</option></select></label><div className="admin-full-span premium-inset"><p className="eyebrow">Calculated points</p><strong>{resultForm.resultText === 'AS' ? '0.5 / 0.5' : resultForm.winningSide === 'A' ? '1 / 0' : resultForm.winningSide === 'B' ? '0 / 1' : 'Choose a winner'}</strong></div><label className="publish-toggle"><input type="checkbox" checked={resultForm.published} onChange={(event) => setResultForm({ ...resultForm, published: event.target.checked })} /> Publish result publicly</label>{resultMatch?.status === 'complete' ? <label className="admin-full-span">Correction reason<input value={resultForm.correctionReason} onChange={(event) => setResultForm({ ...resultForm, correctionReason: event.target.value })} placeholder="What changed?" /></label> : null}<div className="admin-full-span premium-inset"><p className="eyebrow">Selected match</p>{!resultMatch ? <p>Choose a match.</p> : <><strong>{teamsById.get(resultMatch.sideATeamId)?.name ?? 'First team'} v {teamsById.get(resultMatch.sideBTeamId)?.name ?? 'Second team'}</strong><div className="chip-list">{resultParticipants.map((participant) => <span className="pill" key={`${participant.matchId}-${participant.playerId}`}>{participant.side}: {playerLabel(playersById.get(participant.playerId))}</span>)}</div><small>Points available: {resultMatch.pointsAvailable}</small></>}</div><SaveButton state={states['result-entry']} label={resultMatch?.status === 'complete' ? 'Correct result' : 'Save result'} />{resultMatch?.status === 'complete' ? <SaveButton state={states['result-clear']} label="Clear result and return to planned" onClick={() => { if (!selectedTour || !resultMatch) return; void runSave('result-clear', 'Result cleared and match returned to planned.', async () => { if (!window.confirm('Clear this result, remove awarded points, and return the match to planned?')) return selectedTour.id; await submitResult({ tourId: selectedTour.id, matchId: resultMatch.id, pointsSideA: 0, pointsSideB: 0, resultText: 'AS', clearResult: true, correctionReason: resultForm.correctionReason || null }); return selectedTour.id; }); }} /> : null}</form></>}</section> : null}

        {activeTab === 'Handbook' ? <section className="card admin-panel"><p className="eyebrow">Handbook</p><h3>Structured public tour information</h3>{!selectedTour ? <p>No tour is available.</p> : <><p>These sections are stored against the selected tour and render on the public Info page. Use section keys such as key_information, teams_summary, rooms, prize_fund, shirt_colours, travel_notes or faqs.</p><form className="admin-form-grid" onSubmit={submitHandbookSection}><label>Section key<input value={handbookForm.sectionKey} onChange={(event) => setHandbookForm({ ...handbookForm, sectionKey: event.target.value })} placeholder="key_information" /></label><label>Title<input value={handbookForm.title} onChange={(event) => setHandbookForm({ ...handbookForm, title: event.target.value })} /></label><label>Sort order<input value={handbookForm.sortOrder} onChange={(event) => setHandbookForm({ ...handbookForm, sortOrder: event.target.value })} inputMode="numeric" /></label><label className="admin-full-span">Body<textarea value={handbookForm.body} onChange={(event) => setHandbookForm({ ...handbookForm, body: event.target.value })} /></label><SaveButton state={states['handbook-section']} label={handbookForm.id ? 'Save handbook section' : 'Add handbook section'} />{handbookForm.id ? <button type="button" onClick={() => setHandbookForm(emptyHandbookForm)}>Cancel edit</button> : null}</form><div className="admin-card-list">{adminData.handbookSections.length === 0 ? <p>No handbook sections have been added for this tour.</p> : adminData.handbookSections.map((section) => <article className="admin-mini-card" key={section.id}><div><strong>{section.title}</strong><span>{section.sectionKey} · Sort {section.sortOrder}</span>{section.body ? <p>{section.body}</p> : null}</div><button type="button" onClick={() => setHandbookForm({ id: section.id, sectionKey: section.sectionKey, title: section.title, body: section.body ?? '', sortOrder: String(section.sortOrder) })}>Edit</button><button type="button" onClick={() => removeHandbookSection(section.id)}>Delete</button>{states[`delete-handbook-${section.id}`]?.error ? <span className="form-error">{states[`delete-handbook-${section.id}`]?.error}</span> : null}</article>)}</div></>}</section> : null}

        {activeTab === 'Bet Punto' ? <section className="card admin-panel"><p className="eyebrow">Bet Punto</p><h3>Markets, options and indicative returns</h3>{betPuntoVisibilityWarnings.length > 0 ? <div className="premium-inset form-error"><strong>Public visibility warnings</strong>{betPuntoVisibilityWarnings.map((warning) => { const market = adminData?.betMarkets.find((candidate) => candidate.id === warning.marketId); return <p key={warning.marketId}>{market?.title ?? 'Bet Punto market'}: {warning.reason}</p>; })}</div> : null}{!selectedTour ? <p>No tour is available.</p> : <><div className="premium-inset"><p className="eyebrow">Clean slate</p><h4>Reset Bet Punto for this tour</h4><p>Deletes only Bet Punto markets, options and bets for {selectedTour.name}. Golf rounds, matches, teams, players, scores and stats are untouched. This cannot be undone.</p><p>{adminData.betMarkets.length} market{adminData.betMarkets.length === 1 ? '' : 's'} · {adminData.bets.length} bet{adminData.bets.length === 1 ? '' : 's'}</p><label>Type RESET BET PUNTO<input value={betPuntoResetConfirmation} onChange={(event) => setBetPuntoResetConfirmation(event.target.value)} /></label><label className="publish-toggle"><input type="checkbox" checked={betPuntoResetForceCurrent} onChange={(event) => setBetPuntoResetForceCurrent(event.target.checked)} /> I understand this resets the selected/current tour Bet Punto slate.</label><SaveButton state={states['reset-bet-punto-tour']} label="Reset Bet Punto for this tour" onClick={resetSelectedTourBetPunto} /></div><div className="premium-inset"><p className="eyebrow">Quick market setup</p><p>Choose a round first for day-specific markets. Stableford winner options use all attending active players; scramble and better ball options use the teams already assigned to that round's pairings.</p><div className="chip-list"><button className="pill" type="button" onClick={applyStablefordWinnerOptions}>Build Stableford winner market from live players</button><button className="pill" type="button" onClick={createStablefordMarketsForRounds}>Default player winner markets for every round</button><button className="pill" type="button" onClick={() => applyRoundTeamScoreOptions('Scramble lowest score')}>Build team market from round teams</button><button className="pill" type="button" onClick={() => applyRoundTeamScoreOptions('Better ball lowest score')}>Build better ball team market</button></div></div><div className="bet-admin-summary"><div className="stat-grid"><div className="stat-card"><span>Tour stake log</span><strong>{formatPenceCurrency(betPuntoTotalStakePence)}</strong><small>{adminData.bets.filter((bet) => bet.status === 'active').length} active picks</small></div><div className="stat-card"><span>Calculated returns</span><strong>{formatPenceCurrency(betPuntoSettledPayoutPence)}</strong><small>Includes manual return overrides where entered.</small></div><div className="stat-card"><span>Mandatory markets</span><strong>{betPuntoMandatorySummaries.length}</strong><small>{mandatoryBettorNames.length} mandatory bettors per playing day.</small></div></div><div className="table-wrap"><table className="bet-summary-table"><thead><tr><th>Player</th><th>Picks</th><th>Staked</th><th>Calculated return</th><th>Net</th><th>W/L/P</th><th>Missing mandatory</th></tr></thead><tbody>{betPuntoBettorSummaries.length === 0 ? <tr><td colSpan={7}>No Bet Punto player summary yet.</td></tr> : betPuntoBettorSummaries.map((summary) => <tr key={summary.bettorName}><td>{summary.bettorName}</td><td>{summary.totalBets}</td><td>{formatPenceCurrency(summary.totalStakePence)}</td><td>{formatPenceCurrency(summary.settledPayoutPence)}</td><td>{formatPenceCurrency(summary.netPence)}</td><td>{summary.won}/{summary.lost}/{summary.push}</td><td>{summary.missingMandatoryPicks}</td></tr>)}</tbody></table></div><div className="table-wrap"><table className="bet-summary-table"><thead><tr><th>Mandatory market</th><th>Status</th><th>Picks</th><th>Pot</th><th>Missing players</th></tr></thead><tbody>{betPuntoMandatorySummaries.length === 0 ? <tr><td colSpan={5}>No mandatory player/team winner markets yet.</td></tr> : betPuntoMandatorySummaries.map((summary) => <tr key={summary.market.id}><td>{summary.market.title}</td><td>{summary.market.status}</td><td>{summary.totalBets}/{mandatoryBettorNames.length}</td><td>{formatPenceCurrency(summary.totalStakePence)}</td><td>{summary.missingBettorNames.length === 0 ? 'Complete' : summary.missingBettorNames.join(', ')}</td></tr>)}</tbody></table></div></div><form className="admin-form-grid" onSubmit={submitBetMarket}><label>Title<input value={betMarketForm.title} onChange={(event) => setBetMarketForm({ ...betMarketForm, title: event.target.value })} /></label><label>Market type<select value={betPuntoMarketKind({ marketType: betMarketForm.marketType })} onChange={(event) => setSimpleMarketKind(event.target.value as 'player_winner' | 'team_winner')}><option value="player_winner">Player winner</option><option value="team_winner">Team winner</option></select></label><label>Status<select value={betMarketForm.status} onChange={(event) => setBetMarketForm({ ...betMarketForm, status: event.target.value as BetMarket['status'] })}><option value="draft">Draft / prepared (private)</option><option value="open">Live / open</option><option value="closed">Closed / awaiting result</option><option value="settled">Settled and visible</option><option value="void">Cancelled / void</option></select></label><label>Linked round<select value={betMarketForm.roundId} onChange={(event) => setBetMarketRound(event.target.value)}><option value="">Choose round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select>{selectedBetRoundCloseWarning ? <small className="form-error">{selectedBetRoundCloseWarning}</small> : <small>Defaults to the selected round date plus the earliest tee time.</small>}</label><label>Close time<input required={!betMarketForm.closesAt} value={betMarketForm.closesAt} onChange={(event) => setBetMarketForm({ ...betMarketForm, closesAt: event.target.value })} type="datetime-local" /></label><label className="publish-toggle"><input type="checkbox" checked={betMarketForm.required} onChange={(event) => setBetMarketForm({ ...betMarketForm, required: event.target.checked })} /> Mandatory pick market</label><label>Winning/result option<select value={betMarketForm.resultOptionId} onChange={(event) => setBetMarketForm({ ...betMarketForm, resultOptionId: event.target.value })}><option value="">No result</option>{betMarketForm.options.filter((option) => option.id).map((option) => <option value={option.id} key={option.id}>{option.label || 'Option'}</option>)}</select></label><label className="admin-full-span">Description<textarea value={betMarketForm.description} onChange={(event) => setBetMarketForm({ ...betMarketForm, description: event.target.value })} /></label><label className="admin-full-span">Result text<textarea value={betMarketForm.resultText} onChange={(event) => setBetMarketForm({ ...betMarketForm, resultText: event.target.value })} /></label><div className="premium-inset admin-full-span"><strong>Option preview</strong><p>{betPuntoMarketKind({ marketType: betMarketForm.marketType }) === 'player_winner' ? 'Generated from live attending players.' : 'Generated from current tour teams.'}</p><div className="chip-list">{betMarketForm.options.map((option) => <span className="pill" key={option.id ?? option.sortOrder}>{option.label || 'Option'}</span>)}</div></div><details className="premium-inset admin-full-span"><summary>Advanced corrections</summary><div className="admin-form-grid"><label>Scope<select value={betMarketForm.marketScope} onChange={(event) => setBetMarketForm({ ...betMarketForm, marketScope: event.target.value as BetMarket['marketScope'] })}><option value="general_pot">General pot</option><option value="special">Special/manual</option></select></label><label>Match<select value={betMarketForm.matchId} onChange={(event) => setBetMarketForm({ ...betMarketForm, matchId: event.target.value })}><option value="">No match</option>{adminData.matches.map((match) => <option value={match.id} key={match.id}>Match {match.matchNumber}</option>)}</select></label><BetMarketOptionsEditor options={betMarketForm.options} activePlayers={liveTourPlayers} teams={adminData.tourTeams} onChangeOption={updateBetOption} onChangePlayer={updateBetOptionPlayer} onRemoveOption={removeBetOption} onAddOption={addBetOption} /></div></details><SaveButton state={states['bet-market']} label={betMarketForm.id ? 'Save market' : 'Create market'} />{betMarketForm.id ? <SaveButton state={states['bet-market-settle']} label="Settle selected market" onClick={settleSelectedBetMarket} /> : null}</form><div className="admin-card-list">{adminData.betMarkets.length === 0 ? <p>No Bet Punto markets yet.</p> : adminData.betMarkets.map((market) => { const marketBets = adminData.bets.filter((bet) => bet.marketId === market.id); return <article className="admin-mini-card" key={market.id}><div><strong>{market.title}</strong><span>{betPuntoMarketKindLabel(betPuntoMarketKind(market))} · {market.status} · {marketBets.length} bets</span><div className="chip-list">{adminData.betOptions.filter((option) => option.marketId === market.id).map((option) => <span className="pill" key={option.id}>{option.label}{option.oddsDecimal ? ` · ${option.oddsDecimal}x` : ''}</span>)}</div><label>Winner/result<select value={market.resultOptionId ?? ''} disabled={market.status === 'void'} onChange={(event) => settleMarketWithWinner(market, event.target.value)}><option value="">Choose winner</option>{adminData.betOptions.filter((option) => option.marketId === market.id).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>{states[`bet-market-settle-${market.id}`]?.error ? <span className="form-error">{states[`bet-market-settle-${market.id}`]?.error}</span> : null}</div><div className="admin-mini-actions"><button type="button" disabled={states['bet-market']?.saving} onClick={() => setBetMarketForm(betFormFromMarket(market))}>Edit market</button><button type="button" disabled={states[`default-bets-${market.id}`]?.saving} onClick={() => addMissingDefaultPicks(market)}>Add missing default picks</button><button type="button" onClick={() => saveMarketStatus(market, 'open')}>Open</button><button type="button" onClick={() => saveMarketStatus(market, 'closed')}>Close</button><button type="button" onClick={() => saveMarketStatus(market, 'void')}>Void</button><button type="button" disabled={states[`delete-bet-market-${market.id}`]?.saving || marketBets.length > 0} onClick={() => removeBetMarket(market)}>Delete market</button>{states[`delete-bet-market-${market.id}`]?.error ? <span className="form-error">{states[`delete-bet-market-${market.id}`]?.error}</span> : null}</div></article>; })}</div>{selectedBetMarket ? <div className="premium-inset"><p className="eyebrow">Advanced corrections</p><form className="admin-form-grid" onSubmit={submitAdminBet}><label>Bettor<select value={adminBetForm.bettorPlayerId} onChange={(event) => { const player = activePlayers.find((candidate) => candidate.id === event.target.value); setAdminBetForm({ ...adminBetForm, bettorPlayerId: event.target.value, bettorName: player?.displayName ?? adminBetForm.bettorName }); }}><option value="">Manual name</option>{liveTourPlayers.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label><label>Name<input value={adminBetForm.bettorName} onChange={(event) => setAdminBetForm({ ...adminBetForm, bettorName: event.target.value })} /></label><label>Option<select value={adminBetForm.optionId} onChange={(event) => setAdminBetForm({ ...adminBetForm, optionId: event.target.value })}><option value="">Choose option</option>{selectedBetMarketOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Stake (£)<input inputMode="decimal" value={adminBetForm.stake} onChange={(event) => setAdminBetForm({ ...adminBetForm, stake: event.target.value })} /></label><label>Status<select value={adminBetForm.status} onChange={(event) => setAdminBetForm({ ...adminBetForm, status: event.target.value as Bet['status'] })}><option value="active">Active</option><option value="void">Void</option></select></label><label>Comment<input value={adminBetForm.comment} onChange={(event) => setAdminBetForm({ ...adminBetForm, comment: event.target.value })} /></label><label className="admin-full-span">Admin notes / override reason<textarea value={adminBetForm.adminNotes} onChange={(event) => setAdminBetForm({ ...adminBetForm, adminNotes: event.target.value })} /></label><SaveButton state={states['admin-bet']} label={adminBetForm.id ? 'Save bet override' : 'Add manual bet'} /></form>{selectedBetMarketBets.length === 0 ? <p>No bets logged.</p> : selectedBetMarketBets.map((bet) => <p key={bet.id}>{bet.bettorName} → {selectedBetMarketOptions.find((option) => option.id === bet.optionId)?.label ?? 'Option'} · {formatStakeCurrency(bet)} · {bet.status}/{bet.outcomeStatus}{bet.adminEntered ? ' · admin-entered' : ''}{bet.adminNotes ? ` · notes: ${bet.adminNotes}` : ''}{bet.payoutAmountPence !== undefined ? ` · return £${(bet.payoutAmountPence / 100).toFixed(2)}` : ''}<button type="button" onClick={() => startAdminBetEdit(bet)}>Edit bet</button><button type="button" onClick={() => updateBetOutcome(bet, 'won')}>Won</button><button type="button" onClick={() => updateBetOutcome(bet, 'lost')}>Lost</button><button type="button" onClick={() => updateBetOutcome(bet, 'push')}>Push</button><button type="button" onClick={() => promptBetPayout(bet)}>Calculated return</button><button type="button" onClick={() => updateBetStatus(bet, bet.status === 'void' ? 'active' : 'void')}>{bet.status === 'void' ? 'Restore' : 'Void'}</button>{states[`bet-${bet.id}`]?.error ? <span className="form-error">{states[`bet-${bet.id}`]?.error}</span> : null}</p>)}</div> : null}</>}</section> : null}

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

function BetMarketOptionsEditor({ options, activePlayers, teams, onChangeOption, onChangePlayer, onRemoveOption, onAddOption }: { options: BetOptionForm[]; activePlayers: Player[]; teams: TourTeam[]; onChangeOption: (index: number, patch: Partial<BetOptionForm>) => void; onChangePlayer: (index: number, playerId: string) => void; onRemoveOption: (index: number) => void; onAddOption: () => void }) {
  return <div className="admin-full-span bet-option-builder">
    <div className="bet-option-builder-heading">
      <div><p className="eyebrow">Options</p><h4>Build the market choices</h4><small>Cards keep each option readable on mobile. Link a player/team where possible so summaries stay meaningful.</small></div>
      <button className="pill" type="button" onClick={onAddOption}>Add option</button>
    </div>
    <div className="bet-option-card-grid">{options.map((option, index) => <article className="bet-option-editor-card" key={option.id ?? index}>
      <div className="bet-option-card-header">
        <span className="bet-option-number">#{index + 1}</span>
        <div><strong>{option.label || `Option ${index + 1}`}</strong><small>{option.linkedPlayerId ? 'Player-linked' : option.linkedTeamId ? 'Team-linked' : option.linkedMatchSide ? 'Match-side linked' : 'Manual option'}</small></div>
        <button type="button" onClick={() => onRemoveOption(index)} disabled={options.length <= 1}>Remove</button>
      </div>
      <div className="bet-option-card-fields">
        <label className="bet-option-wide">Option label<input value={option.label} placeholder="e.g. Matt, Team Green or Halved match" onChange={(event) => onChangeOption(index, { label: event.target.value })} /></label>
        <label>Linked player<select value={option.linkedPlayerId} onChange={(event) => onChangePlayer(index, event.target.value)}><option value="">No player link</option>{activePlayers.map((player) => <option value={player.id} key={player.id}>{playerLabel(player)}</option>)}</select></label>
        <label>Linked team<select value={option.linkedTeamId} onChange={(event) => onChangeOption(index, { linkedTeamId: event.target.value })}><option value="">No team link</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        <label>Match side<select value={option.linkedMatchSide} onChange={(event) => onChangeOption(index, { linkedMatchSide: event.target.value as BetOptionForm['linkedMatchSide'] })}><option value="">No side link</option><option value="A">First team</option><option value="B">Second team</option><option value="halved">Halved</option></select></label>
        <label>Odds / multiplier<input value={option.oddsDecimal} placeholder="Optional" onChange={(event) => onChangeOption(index, { oddsDecimal: event.target.value })} inputMode="decimal" /></label>
        <label>Sort order<input value={option.sortOrder} onChange={(event) => onChangeOption(index, { sortOrder: event.target.value })} inputMode="numeric" /></label>
      </div>
    </article>)}</div>
  </div>;
}

function AssignmentColumn({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <div className="assignment-column"><div className="section-heading"><strong>{title}</strong><span className="pill">{count}</span></div><div className="chip-list">{children || <span className="pill">None</span>}</div></div>;
}

function PlayerAssignmentChip({ player, teams, currentTeamId, onAssign }: { player: Player; teams: TourTeam[]; currentTeamId: string; onAssign: (playerId: string, teamId: string) => void }) {
  return <span className="assignment-chip"><strong>{playerLabel(player)}</strong><select value={currentTeamId} onChange={(event) => onAssign(player.id, event.target.value)}><option value="">Unassigned</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></span>;
}

function StatusGroup({ title, players }: { title: string; players: Player[] }) {
  return <div><p className="eyebrow">{title}</p><div className="chip-list">{players.length === 0 ? <span className="pill">None</span> : players.map((player) => <span className="pill" key={player.id}>{playerLabel(player)}</span>)}</div></div>;
}
