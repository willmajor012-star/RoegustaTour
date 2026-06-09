import { useEffect, useState, type FormEvent } from 'react';
import { betMarkets, currentTourId, matches, players, rounds, tourTeams, tours } from '../data/mockData';
import { checkStoredAdminSession, clearStoredAdminSession, getStoredAdminSession, loginWithAdminPin, storeAdminSession, type StoredAdminSession } from '../lib/adminSession';
import { formatDate, formatMatchFormat } from '../lib/formatting';

const sections = ['Player Library', 'Tour Setup', 'Teams', 'Rounds', 'Matches', 'Results', 'Betting Markets', 'Historic Import'];
const activeTour = tours.find((tour) => tour.id === currentTourId)!;
const attendingPlayers = players.slice(0, 24);

export function Admin() {
  const [storedSession, setStoredSession] = useState<StoredAdminSession | null>(null);
  const [actorLabel, setActorLabel] = useState(() => getStoredAdminSession()?.session.actorLabel ?? '');
  const [pin, setPin] = useState('');
  const [loginState, setLoginState] = useState<'idle' | 'submitting'>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    checkStoredAdminSession().then((checkedSession) => {
      if (!isCurrent) return;

      setStoredSession(checkedSession);
      if (checkedSession) {
        setActorLabel(checkedSession.session.actorLabel);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, []);

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
  };

  const expiresAtLabel = storedSession ? new Date(storedSession.session.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <div className="page-stack admin-page">
      <section className="page-title">
        <p className="eyebrow">During-tour admin shell</p>
        <h2>Admin</h2>
        <p>This mock/local admin UI is structured for the live workflow: captains can make picks the night before, then an admin can enter rounds, tee times, matches, betting markets and results in the app without touching code. Supabase-backed persistence can be added next.</p>
      </section>

      <section className="card admin-login-panel">
        <div>
          <p className="eyebrow">Admin PIN session</p>
          <h3>{storedSession ? `Signed in as ${storedSession.session.actorLabel}` : 'Sign in to unlock admin writes'}</h3>
          <p>{storedSession ? `This browser has a short-lived admin session until ${expiresAtLabel}. Server write functions still verify the bearer token before accepting changes.` : 'Enter the shared admin PIN to create a short-lived browser session. The PIN is only posted to the Netlify login function and is not stored in local storage.'}</p>
        </div>
        {storedSession ? (
          <button className="admin-secondary-button" type="button" onClick={handleLogout}>Log out</button>
        ) : (
          <form className="admin-login-form" onSubmit={handleLogin}>
            <label>Admin label<input value={actorLabel} onChange={(event) => setActorLabel(event.target.value)} placeholder="Captain / admin name" /></label>
            <label>Shared PIN<input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" type="password" autoComplete="current-password" /></label>
            {loginError ? <p className="form-error">{loginError}</p> : null}
            <button type="submit" disabled={loginState === 'submitting'}>{loginState === 'submitting' ? 'Signing in…' : 'Create admin session'}</button>
          </form>
        )}
      </section>

      {storedSession ? (
        <>
      <nav className="admin-section-nav" aria-label="Admin sections">
        {sections.map((section) => <a className="pill" href={`#${section.toLowerCase().replace(/ /g, '-')}`} key={section}>{section}</a>)}
      </nav>

      <section className="card admin-workflow">
        <h3>Eventual workflow aim</h3>
        <div className="workflow-list">
          <span>Add/edit permanent players</span>
          <span>Assign attending players to {activeTour.name}</span>
          <span>Create teams and assign players</span>
          <span>Create rounds and enter tee times</span>
          <span>Create matches from player dropdowns/chips</span>
          <span>Publish matches for public viewing</span>
          <span>Enter results</span>
          <span>Create, open, close and settle betting markets</span>
        </div>
      </section>

      <section id="player-library" className="admin-panel card">
        <p className="eyebrow">Player Library</p>
        <h3>Permanent players</h3>
        <p>Players remain a library/admin concept. Public users reach player profiles through the Stats leaderboard rather than a raw player database page.</p>
        <div className="admin-form-grid">
          <label>Display name<input defaultValue="New player" /></label>
          <label>Nickname<input placeholder="Optional" /></label>
          <label>Active<select defaultValue="yes"><option value="yes">Yes</option><option value="no">No</option></select></label>
        </div>
        <div className="chip-list">{attendingPlayers.slice(0, 10).map((player) => <span className="pill" key={player.id}>{player.displayName}</span>)}</div>
      </section>

      <section id="tour-setup" className="admin-panel card">
        <p className="eyebrow">Tour Setup</p>
        <h3>{activeTour.name}</h3>
        <div className="admin-form-grid">
          <label>Location<input defaultValue="Amendoeira, Portugal" /></label>
          <label>Start date<input type="date" defaultValue="2026-11-06" /></label>
          <label>End date<input type="date" defaultValue="2026-11-09" /></label>
          <label>Status<select defaultValue="planned"><option>planned</option><option>active</option><option>complete</option></select></label>
        </div>
      </section>

      <section id="teams" className="admin-panel card">
        <p className="eyebrow">Teams</p>
        <h3>Create teams and assign players</h3>
        <div className="admin-form-grid">
          <label>Team name<input defaultValue={tourTeams[0]?.name} /></label>
          <label>Captain<select defaultValue="p1">{attendingPlayers.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label>
          <label>Team colour<input type="color" defaultValue={tourTeams[0]?.colour ?? '#0F2F24'} /></label>
        </div>
        <div className="chip-list">{attendingPlayers.slice(0, 8).map((player, index) => <button className="pill" key={player.id}>{index % 2 === 0 ? '✓ ' : '+ '}{player.displayName}</button>)}</div>
      </section>

      <section id="rounds" className="admin-panel card">
        <p className="eyebrow">Rounds</p>
        <h3>Create/edit round</h3>
        <div className="admin-form-grid">
          <label>Round name<input defaultValue="Friday Opening Matches" /></label>
          <label>Date<input type="date" defaultValue="2026-11-06" /></label>
          <label>Course<input defaultValue="Amendoeira, Portugal" /></label>
          <label>Format label<input defaultValue="Captain picks / format TBC" /></label>
          <label>First tee time<input type="time" /></label>
          <label>Status<select defaultValue="planned"><option>draft</option><option>planned</option><option>active</option><option>complete</option></select></label>
        </div>
        <div className="admin-list">{rounds.filter((round) => round.tourId === currentTourId).map((round) => <p key={round.id}>{formatDate(round.roundDate)} · {round.name} · {round.formatLabel} · {round.status}</p>)}</div>
      </section>

      <section id="matches" className="admin-panel card">
        <p className="eyebrow">Matches</p>
        <h3>Create/edit match</h3>
        <div className="admin-form-grid">
          <label>Round<select defaultValue="r1">{rounds.filter((round) => round.tourId === currentTourId).map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select></label>
          <label>Format<select defaultValue="better_ball"><option value="singles">singles</option><option value="better_ball">better_ball</option><option value="scramble">scramble</option><option value="custom">custom</option></select></label>
          <label>Side A team<select defaultValue="team-oaks">{tourTeams.filter((team) => team.tourId === currentTourId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <label>Side B team<select defaultValue="team-heath">{tourTeams.filter((team) => team.tourId === currentTourId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <label>Tee time<input type="time" /></label>
          <label>Status<select defaultValue="draft"><option>draft</option><option>planned</option><option>active</option><option>complete</option></select></label>
        </div>
        <div className="admin-two-column">
          <div><h4>Side A players multi-select</h4><div className="chip-list">{attendingPlayers.slice(0, 8).map((player) => <button className="pill" key={player.id}>+ {player.displayName}</button>)}</div></div>
          <div><h4>Side B players multi-select</h4><div className="chip-list">{attendingPlayers.slice(8, 16).map((player) => <button className="pill" key={player.id}>+ {player.displayName}</button>)}</div></div>
        </div>
        <label className="publish-toggle"><input type="checkbox" /> Published for public viewing</label>
      </section>

      <section id="results" className="admin-panel card">
        <p className="eyebrow">Results</p>
        <h3>Enter result</h3>
        <div className="admin-form-grid">
          <label>Select match<select defaultValue="m1">{matches.filter((match) => match.tourId === currentTourId).map((match) => <option key={match.id} value={match.id}>Match {match.matchNumber} · {formatMatchFormat(match.format)}</option>)}</select></label>
          <label>Outcome<select defaultValue="A"><option value="A">Side A win</option><option value="B">Side B win</option><option value="halved">Halved</option><option value="void">Void</option></select></label>
          <label>Points side A<input type="number" step="0.5" defaultValue="1" /></label>
          <label>Points side B<input type="number" step="0.5" defaultValue="0" /></label>
          <label>Result text<input defaultValue="2&1" /></label>
        </div>
      </section>

      <section id="betting-markets" className="admin-panel card">
        <p className="eyebrow">Betting Markets</p>
        <h3>Create betting market</h3>
        <div className="admin-form-grid">
          <label>Market type<select defaultValue="match_winner"><option>match_winner</option><option>player_performance</option><option>team_result</option><option>over_under</option><option>special</option><option>custom</option></select></label>
          <label>Title<input defaultValue="Who wins the opening match?" /></label>
          <label>Linked round optional<select><option value="">None</option>{rounds.filter((round) => round.tourId === currentTourId).map((round) => <option key={round.id}>{round.name}</option>)}</select></label>
          <label>Linked match optional<select><option value="">None</option>{matches.filter((match) => match.tourId === currentTourId).map((match) => <option key={match.id}>Match {match.matchNumber}</option>)}</select></label>
          <label>Options<textarea defaultValue={'Side A\nSide B\nHalved'} /></label>
          <label>Status<select defaultValue="open"><option>open</option><option>closed</option><option>settled</option><option>void</option></select></label>
        </div>
        <div className="admin-list">{betMarkets.map((market) => <p key={market.id}>{market.title} · {market.status}</p>)}</div>
      </section>

      <section id="historic-import" className="admin-panel card">
        <p className="eyebrow">Historic Import</p>
        <h3>Legacy stats staging</h3>
        <p>Placeholder for importing previous tour summaries into permanent player records before they are merged into all-time stats.</p>
        <textarea defaultValue="Player,Matches,Wins,Draws,Losses,Points" />
      </section>
        </>
      ) : (
        <section className="card admin-locked-panel">
          <h3>Admin tools locked</h3>
          <p>The player, tour setup, match, result and betting-management drafts appear after an admin session is created. Public pages remain available without an admin session.</p>
        </section>
      )}
    </div>
  );
}
