import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fetchAdminData, savePlayer, saveTour, saveTourPlayer, saveTourTeam, saveTourTeamMembers, type AdminDataResponse } from '../lib/adminApi';
import { checkStoredAdminSession, clearStoredAdminSession, getStoredAdminSession, loginWithAdminPin, storeAdminSession, type StoredAdminSession } from '../lib/adminSession';
import { formatDate } from '../lib/formatting';
import type { Player, Tour, TourTeam } from '../lib/types';

const tabs = ['Overview', 'Tour setup', 'Player library', 'Attendance', 'Teams', 'Coming next'] as const;
type AdminTab = typeof tabs[number];
type SaveState = { saving: boolean; error?: string; success?: string };

type PlayerForm = { id?: string; displayName: string; nickname: string; initials: string; active: boolean };
type TourForm = { id: string; name: string; year: string; location: string; startDate: string; endDate: string; status: Tour['status']; description: string };
type AttendanceDraft = { attending: boolean; tourHandicap: string; notes: string };
type TeamForm = { id?: string; name: string; colour: string; captainPlayerId: string; sortOrder: string };

const emptyPlayerForm: PlayerForm = { displayName: '', nickname: '', initials: '', active: true };
const emptyTeamForm: TeamForm = { name: '', colour: '', captainPlayerId: '', sortOrder: '1' };

function emptyTourForm(tour?: Tour): TourForm {
  return {
    id: tour?.id ?? '',
    name: tour?.name ?? '',
    year: tour?.year ? String(tour.year) : '',
    location: tour?.location ?? '',
    startDate: tour?.startDate ?? '',
    endDate: tour?.endDate ?? '',
    status: tour?.status ?? 'planned',
    description: tour?.description ?? '',
  };
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
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [playerForm, setPlayerForm] = useState<PlayerForm>(emptyPlayerForm);
  const [tourForm, setTourForm] = useState<TourForm>(emptyTourForm());
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [teamMemberDrafts, setTeamMemberDrafts] = useState<Record<string, string[]>>({});
  const [states, setStates] = useState<Record<string, SaveState>>({});

  const loadAdminData = async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const nextData = await fetchAdminData();
      setAdminData(nextData);
      setTourForm(emptyTourForm(nextData.currentTour));
      setAttendanceDrafts(Object.fromEntries(nextData.players.map((player) => {
        const tourPlayer = nextData.tourPlayers.find((row) => row.playerId === player.id);
        return [player.id, { attending: tourPlayer?.attending ?? false, tourHandicap: tourPlayer?.tourHandicap === undefined ? '' : String(tourPlayer.tourHandicap), notes: tourPlayer?.notes ?? '' }];
      })));
      setTeamMemberDrafts(Object.fromEntries(nextData.tourTeams.map((team) => [team.id, nextData.tourTeamMembers.filter((member) => member.teamId === team.id).map((member) => member.playerId)])));
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

  useEffect(() => {
    if (storedSession) void loadAdminData();
  }, [storedSession]);

  const playersById = useMemo(() => new Map((adminData?.players ?? []).map((player) => [player.id, player])), [adminData]);
  const activePlayers = (adminData?.players ?? []).filter((player) => player.active);
  const currentTour = adminData?.currentTour;
  const tourPlayers = adminData?.tourPlayers ?? [];
  const attendingPlayerIds = new Set(tourPlayers.filter((row) => row.attending).map((row) => row.playerId));
  const assignedPlayerIds = new Set((adminData?.tourTeamMembers ?? []).map((member) => member.playerId));
  const attendingUnassigned = activePlayers.filter((player) => attendingPlayerIds.has(player.id) && !assignedPlayerIds.has(player.id));
  const notAttending = activePlayers.filter((player) => !attendingPlayerIds.has(player.id));

  const setSaveState = (key: string, state: SaveState) => setStates((current) => ({ ...current, [key]: state }));

  const runSave = async (key: string, success: string, action: () => Promise<void>) => {
    setSaveState(key, { saving: true });
    try {
      await action();
      setSaveState(key, { saving: false, success });
      await loadAdminData();
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

  const handleLogout = () => {
    clearStoredAdminSession();
    setStoredSession(null);
    setAdminData(null);
  };

  const submitPlayer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSave('player', 'Player saved.', async () => {
      await savePlayer(playerForm);
      setPlayerForm(emptyPlayerForm);
    });
  };

  const submitTour = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSave('tour', 'Tour setup saved.', async () => {
      await saveTour({ ...tourForm, year: Number(tourForm.year) });
    });
  };

  const submitAttendance = (playerId: string) => {
    if (!currentTour) return;
    const draft = attendanceDrafts[playerId];
    void runSave(`attendance-${playerId}`, 'Attendance saved.', async () => {
      await saveTourPlayer({ tourId: currentTour.id, playerId, attending: draft.attending, tourHandicap: draft.tourHandicap === '' ? null : Number(draft.tourHandicap), notes: draft.notes });
    });
  };

  const submitTeam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentTour) return;
    void runSave('team', 'Team saved.', async () => {
      await saveTourTeam({ ...teamForm, tourId: currentTour.id, captainPlayerId: teamForm.captainPlayerId || null, sortOrder: Number(teamForm.sortOrder) });
      setTeamForm(emptyTeamForm);
    });
  };

  const saveMembers = (team: TourTeam) => {
    void runSave(`members-${team.id}`, 'Team members saved.', async () => {
      await saveTourTeamMembers({ tourId: team.tourId, teamId: team.id, playerIds: teamMemberDrafts[team.id] ?? [] });
    });
  };

  const toggleTeamMember = (teamId: string, playerId: string) => {
    setTeamMemberDrafts((current) => {
      const isSelected = (current[teamId] ?? []).includes(playerId);
      const next = Object.fromEntries(Object.entries(current).map(([id, playerIds]) => [id, id === teamId ? playerIds : playerIds.filter((existing) => existing !== playerId)]));
      next[teamId] = isSelected ? (next[teamId] ?? []).filter((existing) => existing !== playerId) : [...(next[teamId] ?? []), playerId];
      return next;
    });
  };

  const expiresAtLabel = storedSession ? new Date(storedSession.session.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return <div className="page-stack admin-page">
    <section className="page-title"><p className="eyebrow">Live setup management</p><h2>Admin</h2><p>PIN-protected tools for live player library, current tour setup, attendance and teams. Rounds, matches, results and Bet Punto writes stay locked for a later PR.</p></section>

    <section className="card admin-login-panel"><div><p className="eyebrow">Admin PIN session</p><h3>{storedSession ? 'Admin session active' : 'Sign in to unlock admin writes'}</h3><p>{storedSession ? `This browser has a short-lived admin session until ${expiresAtLabel}.` : 'Enter the shared admin PIN to create a short-lived browser session. The optional label is only for admin context, not a user account.'}</p></div>{storedSession ? <button className="admin-secondary-button" type="button" onClick={handleLogout}>Log out</button> : <form className="admin-login-form" onSubmit={handleLogin}><label>Admin label<input value={actorLabel} onChange={(event) => setActorLabel(event.target.value)} placeholder="Optional admin label" /></label><label>Shared PIN<input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" type="password" autoComplete="current-password" /></label>{loginError ? <p className="form-error">{loginError}</p> : null}<button type="submit" disabled={loginState === 'submitting'}>{loginState === 'submitting' ? 'Signing in…' : 'Create admin session'}</button></form>}</section>

    {storedSession ? <>
      <nav className="admin-section-nav" aria-label="Admin sections">{tabs.map((tab) => <button className={`pill ${activeTab === tab ? 'selected' : ''}`} type="button" onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</nav>
      {dataLoading ? <p className="card">Loading live admin data…</p> : null}
      {dataError ? <p className="card form-error">{dataError}</p> : null}
      {!dataLoading && !dataError && adminData ? <>
        {activeTab === 'Overview' ? <section className="card admin-panel"><p className="eyebrow">Overview</p><h3>{currentTour?.name ?? 'No current tour'}</h3>{!currentTour ? <p>No live tour has been added yet.</p> : <p>{currentTour.location ?? 'Location TBC'} · {formatDate(currentTour.startDate)} — {formatDate(currentTour.endDate)} · {currentTour.status}</p>}<div className="stat-grid"><Stat label="Active players" value={activePlayers.length} /><Stat label="Attending" value={attendingPlayerIds.size} /><Stat label="Teams" value={adminData.tourTeams.length} /><Stat label="Assigned" value={assignedPlayerIds.size} /><Stat label="Attending unassigned" value={attendingUnassigned.length} /></div></section> : null}

        {activeTab === 'Tour setup' ? <section className="card admin-panel"><p className="eyebrow">Current tour setup</p><h3>Edit tour details</h3>{currentTour ? <form className="admin-form-grid" onSubmit={submitTour}><label>Name<input value={tourForm.name} onChange={(event) => setTourForm({ ...tourForm, name: event.target.value })} /></label><label>Year<input value={tourForm.year} onChange={(event) => setTourForm({ ...tourForm, year: event.target.value })} inputMode="numeric" /></label><label>Location<input value={tourForm.location} onChange={(event) => setTourForm({ ...tourForm, location: event.target.value })} /></label><label>Start date<input value={tourForm.startDate} onChange={(event) => setTourForm({ ...tourForm, startDate: event.target.value })} type="date" /></label><label>End date<input value={tourForm.endDate} onChange={(event) => setTourForm({ ...tourForm, endDate: event.target.value })} type="date" /></label><label>Status<select value={tourForm.status} onChange={(event) => setTourForm({ ...tourForm, status: event.target.value as Tour['status'] })}><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label><label className="admin-full-span">Description<textarea value={tourForm.description} onChange={(event) => setTourForm({ ...tourForm, description: event.target.value })} /></label><SaveButton state={states.tour} label="Save tour setup" /></form> : <p>No current tour is available to edit.</p>}</section> : null}

        {activeTab === 'Player library' ? <section className="card admin-panel"><p className="eyebrow">Player library</p><h3>Permanent players</h3><form className="admin-form-grid" onSubmit={submitPlayer}><label>Display name<input value={playerForm.displayName} onChange={(event) => setPlayerForm({ ...playerForm, displayName: event.target.value })} /></label><label>Nickname<input value={playerForm.nickname} onChange={(event) => setPlayerForm({ ...playerForm, nickname: event.target.value })} /></label><label>Initials<input value={playerForm.initials} onChange={(event) => setPlayerForm({ ...playerForm, initials: event.target.value })} /></label><label>Active<select value={playerForm.active ? 'yes' : 'no'} onChange={(event) => setPlayerForm({ ...playerForm, active: event.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></label><SaveButton state={states.player} label={playerForm.id ? 'Save player' : 'Create player'} /></form><div className="admin-card-list">{adminData.players.length === 0 ? <p>No players have been added yet.</p> : adminData.players.map((player) => <article className="admin-mini-card" key={player.id}><div><strong>{player.displayName}</strong><span>{player.active ? 'Active' : 'Inactive'}{player.initials ? ` · ${player.initials}` : ''}{player.nickname ? ` · ${player.nickname}` : ''}</span></div><button type="button" onClick={() => setPlayerForm({ id: player.id, displayName: player.displayName, nickname: player.nickname ?? '', initials: player.initials ?? '', active: player.active })}>Edit</button></article>)}</div></section> : null}

        {activeTab === 'Attendance' ? <section className="card admin-panel"><p className="eyebrow">Current tour attendance</p><h3>{currentTour?.name ?? 'No current tour'}</h3>{!currentTour ? <p>No current tour is available.</p> : <div className="admin-card-list">{activePlayers.length === 0 ? <p>No active players are available.</p> : activePlayers.map((player) => { const draft = attendanceDrafts[player.id] ?? { attending: false, tourHandicap: '', notes: '' }; return <article className="admin-mini-card attendance-card" key={player.id}><div><strong>{playerLabel(player)}</strong><label className="publish-toggle"><input type="checkbox" checked={draft.attending} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, attending: event.target.checked } })} /> Attending</label></div><label>Handicap<input value={draft.tourHandicap} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, tourHandicap: event.target.value } })} inputMode="decimal" /></label><label>Notes<input value={draft.notes} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [player.id]: { ...draft, notes: event.target.value } })} /></label><SaveButton state={states[`attendance-${player.id}`]} label="Save" onClick={() => submitAttendance(player.id)} /></article>; })}</div>}</section> : null}

        {activeTab === 'Teams' ? <section className="card admin-panel"><p className="eyebrow">Current tour teams</p><h3>Teams and members</h3>{!currentTour ? <p>No current tour is available.</p> : <><form className="admin-form-grid" onSubmit={submitTeam}><label>Team name<input value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></label><label>Colour<input value={teamForm.colour} onChange={(event) => setTeamForm({ ...teamForm, colour: event.target.value })} /></label><label>Captain<select value={teamForm.captainPlayerId} onChange={(event) => setTeamForm({ ...teamForm, captainPlayerId: event.target.value })}><option value="">No captain</option>{activePlayers.map((player) => <option value={player.id} key={player.id}>{playerLabel(player)}</option>)}</select></label><label>Sort order<input value={teamForm.sortOrder} onChange={(event) => setTeamForm({ ...teamForm, sortOrder: event.target.value })} inputMode="numeric" /></label><SaveButton state={states.team} label={teamForm.id ? 'Save team' : 'Create team'} /></form><div className="admin-status-groups"><StatusGroup title="Attending but unassigned" players={attendingUnassigned} /><StatusGroup title="Not attending" players={notAttending} /></div><div className="admin-card-list">{adminData.tourTeams.length === 0 ? <p>No teams have been created for this tour yet.</p> : adminData.tourTeams.map((team) => <article className="admin-mini-card team-card" key={team.id}><div><strong>{team.name}</strong><span>{team.colour ?? 'Colour TBC'} · Sort {team.sortOrder}{team.captainPlayerId ? ` · Captain ${playerLabel(playersById.get(team.captainPlayerId))}` : ''}</span></div><button type="button" onClick={() => setTeamForm({ id: team.id, name: team.name, colour: team.colour ?? '', captainPlayerId: team.captainPlayerId ?? '', sortOrder: String(team.sortOrder) })}>Edit team</button><div className="admin-full-span"><p className="eyebrow">Members</p><div className="chip-list">{activePlayers.filter((player) => attendingPlayerIds.has(player.id)).map((player) => <button className={`pill ${teamMemberDrafts[team.id]?.includes(player.id) ? 'selected' : ''}`} type="button" onClick={() => toggleTeamMember(team.id, player.id)} key={player.id}>{playerLabel(player)}</button>)}</div><SaveButton state={states[`members-${team.id}`]} label="Save members" onClick={() => saveMembers(team)} /></div></article>)}</div></>}</section> : null}

        {activeTab === 'Coming next' ? <section className="card admin-panel"><p className="eyebrow">Coming next</p><h3>Locked for later PRs</h3><div className="workflow-list"><span>Rounds & tee times</span><span>Matches & pairings</span><span>Match results</span><span>Bet Punto markets</span><span>Scorecard summaries</span></div></section> : null}
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
