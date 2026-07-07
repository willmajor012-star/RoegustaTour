import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { checkPublicAccess, loginPublicAccess } from '../lib/publicAccess';

type Props = { children: ReactNode; isAdminRoute: boolean };

export function PublicPasswordGate({ children, isAdminRoute }: Props) {
  const [accessState, setAccessState] = useState<'checking' | 'locked' | 'unlocked'>(isAdminRoute ? 'unlocked' : 'checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAdminRoute) { setAccessState('unlocked'); return; }
    let cancelled = false;
    setAccessState('checking');
    checkPublicAccess().then((ok) => { if (!cancelled) setAccessState(ok ? 'unlocked' : 'locked'); }).catch(() => { if (!cancelled) setAccessState('locked'); });
    return () => { cancelled = true; };
  }, [isAdminRoute]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await loginPublicAccess(password);
      setPassword('');
      setAccessState('unlocked');
      window.dispatchEvent(new CustomEvent('public-access-changed'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Incorrect password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (accessState === 'unlocked') return <>{children}</>;
  if (accessState === 'checking') return <div className="public-password-screen"><section className="public-password-card card"><p>Checking tour access…</p></section></div>;

  return <div className="public-password-screen"><section className="public-password-card card"><img src="/brand/roegusta-logo-mark.png" alt="Roegusta Tour mark" /><p className="eyebrow">Private golf tour</p><h1>Roegusta Tour</h1><p>Enter the tour password to continue.</p><form onSubmit={submit}><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p className="form-error">{error}</p> : null}<button type="submit" disabled={submitting}>{submitting ? 'Checking…' : 'Continue'}</button></form><small>Public access is separate from Admin PIN access.</small></section></div>;
}
