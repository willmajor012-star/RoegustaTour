import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fetchAdminData, saveMatch, savePlayer, saveRound, saveTour, saveTourPlayer, saveTourTeam, saveTourTeamMembers, type AdminDataResponse } from '../lib/adminApi';
import { checkStoredAdminSession, clearStoredAdminSession, getStoredAdminSession, loginWithAdminPin, storeAdminSession, type StoredAdminSession } from '../lib/adminSession';
import { formatDate } from '../lib/formatting';
import type { Match, MatchFormat, Player, Round, Tour, TourTeam } from '../lib/types';

const tabs = ['Overview', 'Tour setup', 'Player library', 'Squads & teams', 'Rounds & tee times', 'Matches & pairings', 'Coming next'] as const;
type AdminTab = typeof tabs[number];
type SaveState = { saving: boolean; error?: string; success?: string };

type PlayerForm = { id?: string; displayName: string; nickname: string; initials: string; active: boolean };
type TourForm = { id?: string; name: string; year: string; location: string; startDate: string; endDate: string; status: Tour['status']; description: string };
type AttendanceDraft = { attending: boolean; tourHandicap: string; notes: string; teamId: string };
type TeamForm = { id?: string; name: string; colour: string; captainPlayerId: string; sortOrder: string };
type RoundForm = { id?: string; roundNumber: string; name: string; roundDate: string; courseName: string; teeTime: string; format: MatchFormat; notes: string; status: Round['status'] };
type MatchForm = { id?: string; roundId: string; matchNumber: string; format: MatchFormat; status: Match['status']; sideATeamId: string; sideBTeamId: string; sideALabel: string; sideBLabel: string; pointsAvailable: string; teeTime: string; published: boolean; notes: string; sideAPlayerIds: string[]; sideBPlayerIds: string[] };

const emptyPlayerForm: PlayerForm = { displayName: '', nickname: '', initials: '', active: true };
const emptyTeamForm: TeamForm = { name: '', colour: '', captainPlayerId: '', sortOrder: '1' };
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

function emptyRoundForm(round?: Round): RoundForm {
  return { id: round?.id, roundNumber: round?.roundNumber ? String(round.roundNumber) : '1', name: round?.name ?? 'Round 1', roundDate: round?.roundDate ?? '', courseName: round?.courseName ?? '', teeTime: round?.teeTime ?? '', format: formatByLabel.get((round?.formatLabel ?? '').toLowerCase()) ?? 'singles', notes: round?.notes ?? '', status: round?.status ?? 'draft' };
}

function emptyMatchForm(round?: Round, match?: Match): MatchForm {
  const defaultFormat = formatByLabel.get((round?.formatLabel ?? '').toLowerCase()) ?? 'singles';
  return { id: match?.id, roundId: match?.roundId ?? round?.id ?? '', matchNumber: match?.matchNumber ? String(match.matchNumber) : '1', format: match?.format ?? defaultFormat, status: match?.status ?? 'draft', sideATeamId: match?.sideATeamId ?? '', sideBTeamId: match?.sideBTeamId ?? '', sideALabel: match?.sideALabel ?? '', sideBLabel: match?.sideBLabel ?? '', pointsAvailable: match?.pointsAvailable ? String(match.pointsAvailable) : '1', teeTime: match?.teeTime ?? '', published: match?.published ?? false, notes: match?.notes ?? '', sideAPlayerIds: [], sideBPlayerIds: [] };
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
  const [matchForm, setMatchForm] = useState<MatchForm>(emptyMatchForm());
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
      setRoundForm(emptyRoundForm(nextData.rounds[0]));
      setMatchForm(emptyMatchForm(nextData.rounds[0]));
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
  const selectedRound = (adminData?.rounds ?? []).find((round) => round.id === matchForm.roundId) ?? adminData?.rounds[0];
  const roundMatches = (adminData?.matches ?? []).filter((match) => match.roundId === matchForm.roundId);
  const draftMatches = (adminData?.matches ?? []).filter((match) => !match.published && match.status !== 'complete').length;
  const publishedMatches = (adminData?.matches ?? []).filter((match) => match.published).length;
  const completeMatches = (adminData?.matches ?? []).filter((match) => match.status === 'complete').length;

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
  const submitRound = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('round', 'Round saved.', async () => { await saveRound({ ...roundForm, tourId: selectedTour.id, roundNumber: Number(roundForm.roundNumber), roundDate: roundForm.roundDate || null, courseName: roundForm.courseName || null, teeTime: roundForm.teeTime || null, notes: roundForm.notes || null }); }); };
  const submitMatch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedTour) return; void runSave('match', 'Match saved.', async () => { await saveMatch({ ...matchForm, tourId: selectedTour.id, matchNumber: Number(matchForm.matchNumber), pointsAvailable: Number(matchForm.pointsAvailable), teeTime: matchForm.teeTime || null, sideALabel: matchForm.sideALabel || null, sideBLabel: matchForm.sideBLabel || null, notes: matchForm.notes || null }); }); };

  const saveSquadPlayer = (playerId: string) => {
    if (!selectedTour) return;
    const draft = attendanceDrafts[playerId];
    void runSave(`squad-${playerId}`, 'Player squad saved.', async () => {
      await saveTourPlayer({ tourId: selectedTour.id, playerId, attending: draft.attending, tourHandicap: draft.tourHandicap === '' ? null : Number(draft.tourHandicap), notes: draft.notes });
      for (const team of adminData?.tourTeams ?? []) {
        const currentIds = (adminData?.tourTeamMembers ?? []).filter((member) => member.teamId === team.id).map((member) => member.playerId).filter((id) => id !== playerId);
        const playerIds = draft.attending && draft.teamId === team.id ? [...currentIds, playerId] : currentIds;
        await saveTourTeamMembers({ tourId: selectedTour.id, teamId: team.id, playerIds });
      }
    });
  };

  const seedThreeRounds = () => {
    if (!selectedTour) return;
    void runSave('seed-rounds', 'Three draft rounds seeded.', async () => {
      for (const roundNumber of [1, 2, 3]) {
        const existing = adminData?.rounds.find((round) => round.roundNumber === roundNumber);
        await saveRound({ id: existing?.id, tourId: selectedTour.id, roundNumber, name: existing?.name ?? `Round ${roundNumber}`, status: existing?.status ?? 'draft', format: formatByLabel.get((existing?.formatLabel ?? '').toLowerCase()) ?? 'singles', roundDate: existing?.roundDate ?? null, courseName: existing?.courseName ?? null, teeTime: existing?.teeTime ?? null, notes: existing?.notes ?? null });
      }
    });
  };

  const toggleMatchPlayer = (side: 'A' | 'B', playerId: string) => setMatchForm((current) => {
    const ownKey = side === 'A' ? 'sideAPlayerIds' : 'sideBPlayerIds';
    const otherKey = side === 'A' ? 'sideBPlayerIds' : 'sideAPlayerIds';
    const own = current[ownKey].includes(playerId) ? current[ownKey].filter((id) => id !== playerId) : [...current[ownKey], playerId];
    return { ...current, [ownKey]: own, [otherKey]: current[otherKey].filter((id) => id !== playerId) };
  });

  const expiresAtLabel = storedSession ? new Date(storedSession.session.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return <div className="page-stack admin-page">
    <section className="page-title"><p className="eyebrow">Live setup management</p><h2>Admin</h2><p>PIN-protected tools for live tour lifecycle, squads, rounds and draft/published pairings. Result entry, Bet Punto settlement and the public redesign stay deferred.</p></section>
    <section className="card admin-login-panel"><div><p className="eyebrow">Admin PIN session</p><h3>{storedSession ? 'Admin session active' : 'Sign in to unlock admin writes'}</h3><p>{storedSession ? `This browser has a short-lived admin session until ${expiresAtLabel}.` : 'Enter the shared admin PIN to create a short-lived browser session. The optional label is only for admin context, not a user account.'}</p></div>{storedSession ? <button className="admin-secondary-button" type="button" onClick={handleLogout}>Log out</button> : <form className="admin-login-form" onSubmit={handleLogin}><label>Admin label<input value={actorLabel} onChange={(event) => setActorLabel(event.target.value)} placeholder="Optional admin label" /></label><label>Shared PIN<input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" type="password" autoComplete="current-password" /></label>{loginError ? <p className="form-error">{loginError}</p> : null}<button type="submit" disabled={loginState === 'submitting'}>{loginState === 'submitting' ? 'Signing in…' : 'Create admin session'}</button></form>}</section>

    {storedSession ? <>
      <nav className="admin-section-nav" aria-label="Admin sections">{tabs.map((tab) => <button className={`pill ${activeTab === tab ? 'selected' : ''}`} type="button" onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</nav>
      {dataLoading ? <p className="card">Loading live admin data…</p> : null}
      {dataError ? <p className="card form-error">{dataError}</p> : null}
      {!dataLoading && !dataError && adminData ? <>
        {activeTab === 'Overview' ? <section className="card admin-panel"><p className="eyebrow">Overview</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{selectedTour ? <p>{selectedTour.location ?? 'Location TBC'} · {formatDate(selectedTour.startDate)} — {formatDate(selectedTour.endDate)} · {selectedTour.status}</p> : <p>No tour has been added yet.</p>}<div className="stat-grid"><Stat label="Active players" value={activePlayers.length} /><Stat label="Inactive players" value={inactivePlayers.length} /><Stat label="Attending" value={attendingPlayerIds.size} /><Stat label="Teams" value={adminData.tourTeams.length} /><Stat label="Assigned attending" value={assignedPlayerIds.size} /><Stat label="Attending unassigned" value={attendingUnassigned.length} /><Stat label="Rounds" value={adminData.rounds.length} /><Stat label="Draft matches" value={draftMatches} /><Stat label="Published matches" value={publishedMatches} /><Stat label="Complete matches" value={completeMatches} /></div></section> : null}

        {activeTab === 'Tour setup' ? <section className="card admin-panel"><p className="eyebrow">Tour lifecycle</p><h3>Edit or create annual tours</h3><p>Archiving or completing a tour does not delete historic matches, results or stats.</p><div className="chip-list">{adminData.tours.map((tour) => <button className={`pill ${selectedTour?.id === tour.id ? 'selected' : ''}`} type="button" key={tour.id} onClick={() => void loadAdminData(tour.id)}>{tour.name} · {tour.status}</button>)}</div><div className="chip-list"><button className="pill" type="button" onClick={() => setTourForm(emptyTourForm())}>Create new tour</button><button className="pill" type="button" onClick={() => { const nextYear = Math.max(new Date().getFullYear(), ...adminData.tours.map((tour) => tour.year)) + 1; setTourForm({ name: `Roegusta Tour ${nextYear}`, year: String(nextYear), status: 'planned', location: '', startDate: '', endDate: '', description: '' }); }}>Create next tour</button></div><form className="admin-form-grid" onSubmit={submitTour}><label>Name<input value={tourForm.name} onChange={(event) => setTourForm({ ...tourForm, name: event.target.value })} /></label><label>Year<input value={tourForm.year} onChange={(event) => setTourForm({ ...tourForm, year: event.target.value })} inputMode="numeric" /></label><label>Location<input value={tourForm.location} onChange={(event) => setTourForm({ ...tourForm, location: event.target.value })} /></label><label>Start date<input value={tourForm.startDate} onChange={(event) => setTourForm({ ...tourForm, startDate: event.target.value })} type="date" /></label><label>End date<input value={tourForm.endDate} onChange={(event) => setTourForm({ ...tourForm, endDate: event.target.value })} type="date" /></label><label>Status<select value={tourForm.status} onChange={(event) => setTourForm({ ...tourForm, status: event.target.value as Tour['status'] })}><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label><label className="admin-full-span">Description<textarea value={tourForm.description} onChange={(event) => setTourForm({ ...tourForm, description: event.target.value })} /></label><SaveButton state={states.tour} label={tourForm.id ? 'Save tour' : 'Create tour'} /></form></section> : null}

        {activeTab === 'Player library' ? <section className="card admin-panel"><p className="eyebrow">Player library</p><h3>Permanent players</h3><form className="admin-form-grid" onSubmit={submitPlayer}><label>Display name<input value={playerForm.displayName} onChange={(event) => setPlayerForm({ ...playerForm, displayName: event.target.value })} /></label><label>Nickname<input value={playerForm.nickname} onChange={(event) => setPlayerForm({ ...playerForm, nickname: event.target.value })} /></label><label>Initials<input value={playerForm.initials} onChange={(event) => setPlayerForm({ ...playerForm, initials: event.target.value })} /></label><label>Active<select value={playerForm.active ? 'yes' : 'no'} onChange={(event) => setPlayerForm({ ...playerForm, active: event.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></label><SaveButton state={states.player} label={playerForm.id ? 'Save player' : 'Create player'} /></form><div className="admin-card-list">{adminData.players.map((player) => <article className="admin-mini-card" key={player.id}><div><strong>{player.displayName}</strong><span>{player.active ? 'Active' : 'Inactive'}{player.initials ? ` · ${player.initials}` : ''}{player.nickname ? ` · ${player.nickname}` : ''}</span></div><button type="button" onClick={() => setPlayerForm({ id: player.id, displayName: player.displayName, nickname: player.nickname ?? '', initials: player.initials ?? '', active: player.active })}>Edit</button></article>)}</div></section> : null}

        {activeTab === 'Squads & teams' ? <section className="card admin-panel"><p className="eyebrow">Squads & teams</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{!selectedTour ? <p>No tour is available.</p> : <><form className="admin-form-grid" onSubmit={submitTeam}><label>Team name<input value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></label><label>Colour<input value={teamForm.colour} onChange={(event) => setTeamForm({ ...teamForm, colour: event.target.value })} /></label><label>Captain<select value={teamForm.captainPlayerId} onChange={(event) => setTeamForm({ ...teamForm, captainPlayerId: event.target.value })}><option value="">No captain</option>{activePlayers.map((player) => <option value={player.id} key={player.id}>{playerLabel(player)}</option>)}</select></label><label>Sort order<input value={teamForm.sortOrder} onChange={(event) => setTeamForm({ ...teamForm, sortOrder: event.target.value })} inputMode="numeric" /></label><SaveButton state={states.team} label={teamForm.id ? 'Save team' : 'Create team'} /></form><div className="admin-status-groups"><StatusGroup title="Attending but unassigned" players={attendingUnassigned} /><StatusGroup title="Not attending" players={notAttending} /></div><div className="admin-card-list">{activePlayers.map((player) => { const draft = attendanceDrafts[player.id] ?? { attending: false, tourHandicap: '', notes: '', teamId: '' }; return <article className="admin-mini-card attendance-card" key={player.id}><div><strong>{playerLabel(player)}</strong><label className="publish-toggle"><input type="checkbox" checked={draft.attending} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, attending: event.target.checked, teamId: event.target.checked ? draft.teamId : '' } })} /> Attending</label></div><label>Handicap<input value={draft.tourHandicap} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, tourHandicap: event.target.value } })} inputMode="decimal" /></label><label>Team<select value={draft.teamId} disabled={!draft.attending} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, teamId: event.target.value } })}><option value="">Unassigned</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Notes<input value={draft.notes} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, notes: event.target.value } })} /></label><SaveButton state={states[`squad-${player.id}`]} label="Save player" onClick={() => saveSquadPlayer(player.id)} /></article>; })}</div><details><summary>Inactive players</summary><div className="chip-list">{inactivePlayers.length === 0 ? <span className="pill">None</span> : inactivePlayers.map((player) => <span className="pill" key={player.id}>{playerLabel(player)}</span>)}</div></details><div className="admin-card-list">{adminData.tourTeams.map((team) => <article className="admin-mini-card team-card" key={team.id}><div><strong>{team.name}</strong><span>{team.colour ?? 'Colour TBC'} · Sort {team.sortOrder}{team.captainPlayerId ? ` · Captain ${playerLabel(playersById.get(team.captainPlayerId))}` : ''}</span><div className="chip-list">{adminData.tourTeamMembers.filter((member) => member.teamId === team.id).map((member) => <span className="pill" key={member.id}>{playerLabel(playersById.get(member.playerId))}</span>)}</div></div><button type="button" onClick={() => setTeamForm({ id: team.id, name: team.name, colour: team.colour ?? '', captainPlayerId: team.captainPlayerId ?? '', sortOrder: String(team.sortOrder) })}>Edit team</button></article>)}</div></>}</section> : null}

        {activeTab === 'Rounds & tee times' ? <section className="card admin-panel"><p className="eyebrow">Rounds & tee times</p><h3>{selectedTour?.name ?? 'No selected tour'}</h3>{!selectedTour ? <p>No tour is available.</p> : <><div className="chip-list"><button className="pill" type="button" onClick={() => setRoundForm(emptyRoundForm({ id: '', tourId: selectedTour.id, roundNumber: adminData.rounds.length + 1, name: `Round ${adminData.rounds.length + 1}`, status: 'draft' }))}>New round</button><SaveButton state={states['seed-rounds']} label="Seed 3 draft rounds" onClick={seedThreeRounds} /></div><form className="admin-form-grid" onSubmit={submitRound}><label>Round number<input value={roundForm.roundNumber} onChange={(event) => setRoundForm({ ...roundForm, roundNumber: event.target.value })} inputMode="numeric" /></label><label>Name<input value={roundForm.name} onChange={(event) => setRoundForm({ ...roundForm, name: event.target.value })} /></label><label>Date<input value={roundForm.roundDate} onChange={(event) => setRoundForm({ ...roundForm, roundDate: event.target.value })} type="date" /></label><label>Tee time<input value={roundForm.teeTime} onChange={(event) => setRoundForm({ ...roundForm, teeTime: event.target.value })} type="time" /></label><label>Course<input value={roundForm.courseName} onChange={(event) => setRoundForm({ ...roundForm, courseName: event.target.value })} /></label><label>Default format<select value={roundForm.format} onChange={(event) => setRoundForm({ ...roundForm, format: event.target.value as MatchFormat })}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Status<select value={roundForm.status} onChange={(event) => setRoundForm({ ...roundForm, status: event.target.value as Round['status'] })}><option value="draft">Draft</option><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option></select></label><label className="admin-full-span">Notes<textarea value={roundForm.notes} onChange={(event) => setRoundForm({ ...roundForm, notes: event.target.value })} /></label><SaveButton state={states.round} label={roundForm.id ? 'Save round' : 'Create round'} /></form><div className="admin-card-list">{adminData.rounds.length === 0 ? <p>No rounds have been added yet.</p> : adminData.rounds.map((round) => <article className="admin-mini-card" key={round.id}><div><strong>{round.name}</strong><span>Round {round.roundNumber} · {round.formatLabel ?? 'Format TBC'} · {round.status}</span><span>{round.courseName ?? 'Course TBC'} · {formatDate(round.roundDate)} {round.teeTime ? `· ${round.teeTime}` : ''}</span></div><button type="button" onClick={() => setRoundForm(emptyRoundForm(round))}>Edit</button></article>)}</div></>}</section> : null}

        {activeTab === 'Matches & pairings' ? <section className="card admin-panel"><p className="eyebrow">Matches & pairings</p><h3>Draft and publish pairings</h3>{!selectedTour ? <p>No tour is available.</p> : adminData.rounds.length === 0 ? <p>No rounds have been added yet.</p> : <><label>Round<select value={matchForm.roundId} onChange={(event) => { const round = adminData.rounds.find((candidate) => candidate.id === event.target.value); setMatchForm(emptyMatchForm(round)); }}><option value="">Choose round</option>{adminData.rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select></label><form className="admin-form-grid" onSubmit={submitMatch}><label>Match number<input value={matchForm.matchNumber} onChange={(event) => setMatchForm({ ...matchForm, matchNumber: event.target.value })} inputMode="numeric" /></label><label>Format<select value={matchForm.format} onChange={(event) => setMatchForm({ ...matchForm, format: event.target.value as MatchFormat })}>{formatOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Side A team<select value={matchForm.sideATeamId} onChange={(event) => setMatchForm({ ...matchForm, sideATeamId: event.target.value })}><option value="">Choose team</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Side B team<select value={matchForm.sideBTeamId} onChange={(event) => setMatchForm({ ...matchForm, sideBTeamId: event.target.value })}><option value="">Choose team</option>{adminData.tourTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Points available<input value={matchForm.pointsAvailable} onChange={(event) => setMatchForm({ ...matchForm, pointsAvailable: event.target.value })} inputMode="decimal" /></label><label>Tee time<input value={matchForm.teeTime} onChange={(event) => setMatchForm({ ...matchForm, teeTime: event.target.value })} /></label><label>Status<select value={matchForm.status} onChange={(event) => setMatchForm({ ...matchForm, status: event.target.value as Match['status'] })}><option value="draft">Draft</option><option value="planned">Planned</option><option value="active">Active</option></select></label><label className="publish-toggle"><input type="checkbox" checked={matchForm.published} onChange={(event) => setMatchForm({ ...matchForm, published: event.target.checked })} /> Published publicly</label><label>Side A label<input value={matchForm.sideALabel} onChange={(event) => setMatchForm({ ...matchForm, sideALabel: event.target.value })} /></label><label>Side B label<input value={matchForm.sideBLabel} onChange={(event) => setMatchForm({ ...matchForm, sideBLabel: event.target.value })} /></label><div><p className="eyebrow">Side A players</p><div className="chip-list">{activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player) => <button className={`pill ${matchForm.sideAPlayerIds.includes(player.id) ? 'selected' : ''}`} type="button" onClick={() => toggleMatchPlayer('A', player.id)} key={player.id}>{playerLabel(player)}</button>)}</div></div><div><p className="eyebrow">Side B players</p><div className="chip-list">{activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player) => <button className={`pill ${matchForm.sideBPlayerIds.includes(player.id) ? 'selected' : ''}`} type="button" onClick={() => toggleMatchPlayer('B', player.id)} key={player.id}>{playerLabel(player)}</button>)}</div></div><label className="admin-full-span">Notes<textarea value={matchForm.notes} onChange={(event) => setMatchForm({ ...matchForm, notes: event.target.value })} /></label><SaveButton state={states.match} label={matchForm.id ? 'Save match' : 'Create match'} /></form><div className="admin-card-list">{roundMatches.length === 0 ? <p>No matches have been added for this round yet.</p> : roundMatches.map((match) => <article className="admin-mini-card" key={match.id}><div><strong>Match {match.matchNumber}: {teamsById.get(match.sideATeamId)?.name ?? 'Side A'} v {teamsById.get(match.sideBTeamId)?.name ?? 'Side B'}</strong><span>{match.format} · {match.status} · {match.published ? 'Published' : 'Draft/unpublished'} · {match.pointsAvailable} pts</span></div><button type="button" onClick={() => { const participants = adminData.matchParticipants.filter((participant) => participant.matchId === match.id); setMatchForm({ ...emptyMatchForm(selectedRound, match), sideAPlayerIds: participants.filter((participant) => participant.side === 'A').map((participant) => participant.playerId), sideBPlayerIds: participants.filter((participant) => participant.side === 'B').map((participant) => participant.playerId) }); }}>Edit</button></article>)}</div></>}</section> : null}

        {activeTab === 'Coming next' ? <section className="card admin-panel"><p className="eyebrow">Coming next</p><h3>Deliberately deferred</h3><div className="workflow-list"><span>Match result entry</span><span>Automatic player_match_results generation</span><span>Bet Punto market creation</span><span>Bet Punto settlement</span><span>Scorecard summaries</span><span>Birdies/bogeys/stableford entry</span><span>Site-wide Tour PIN lock</span><span>Public redesign</span></div></section> : null}
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
