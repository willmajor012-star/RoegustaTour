import { clearPublicAccessCookie } from './_publicAccess';
function json(statusCode: number, payload: unknown, headers?: Record<string, string>) { return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', ...(headers ?? {}) }, body: JSON.stringify(payload) }; }
export const handler = async () => json(200, { ok: true }, { 'Set-Cookie': clearPublicAccessCookie() });
