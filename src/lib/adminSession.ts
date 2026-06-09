export type AdminSession = {
  actorLabel: string;
  issuedAt: string;
  expiresAt: string;
};

export type StoredAdminSession = {
  token: string;
  session: AdminSession;
};

const STORAGE_KEY = 'roegusta-admin-session';

export function getStoredAdminSession(): StoredAdminSession | null {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return null;

    const stored = JSON.parse(rawValue) as StoredAdminSession;
    if (!stored.token || !stored.session?.expiresAt) return null;

    if (new Date(stored.session.expiresAt).getTime() <= Date.now()) {
      clearStoredAdminSession();
      return null;
    }

    return stored;
  } catch {
    clearStoredAdminSession();
    return null;
  }
}

export function storeAdminSession(session: StoredAdminSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAdminSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getAdminAuthorizationHeaders(): Record<string, string> {
  const storedSession = getStoredAdminSession();

  return storedSession ? { authorization: `Bearer ${storedSession.token}` } : {};
}

export async function checkStoredAdminSession(): Promise<StoredAdminSession | null> {
  const storedSession = getStoredAdminSession();
  if (!storedSession) return null;

  try {
    const response = await fetch('/.netlify/functions/admin-session', {
      method: 'GET',
      headers: { authorization: `Bearer ${storedSession.token}` },
    });

    if (!response.ok) {
      clearStoredAdminSession();
      return null;
    }

    const payload = await response.json() as { session?: AdminSession };
    if (!payload.session?.expiresAt) {
      clearStoredAdminSession();
      return null;
    }

    const checkedSession = {
      token: storedSession.token,
      session: payload.session,
    };
    storeAdminSession(checkedSession);

    return checkedSession;
  } catch {
    clearStoredAdminSession();
    return null;
  }
}

export async function loginWithAdminPin(pin: string, actorLabel: string): Promise<StoredAdminSession> {
  const response = await fetch('/.netlify/functions/admin-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin, actorLabel }),
  });
  const payload = await response.json() as { token?: string; session?: AdminSession; message?: string };

  if (!response.ok || !payload.token || !payload.session) {
    throw new Error(payload.message ?? 'Unable to create an admin session.');
  }

  return {
    token: payload.token,
    session: payload.session,
  };
}
