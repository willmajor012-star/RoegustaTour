export async function checkPublicAccess() {
  const response = await fetch('/.netlify/functions/public-access-check', { method: 'GET' });
  return response.ok;
}

export async function loginPublicAccess(password: string) {
  const response = await fetch('/.netlify/functions/public-access-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? 'Password could not be verified.');
  return true;
}

export async function logoutPublicAccess() {
  await fetch('/.netlify/functions/public-access-logout', { method: 'POST' });
}
