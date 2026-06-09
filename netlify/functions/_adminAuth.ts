declare const process: { env: Record<string, string | undefined> };

type HeadersMap = Record<string, string | undefined>;

export type FunctionEvent = {
  httpMethod: string;
  body: string | null;
  headers?: HeadersMap;
  queryStringParameters?: Record<string, string | undefined> | null;
};

export type FunctionResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export type AdminSession = {
  actorLabel: string;
  issuedAt: string;
  expiresAt: string;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class AdminConfigurationError extends Error {
  constructor(message = 'Admin login is not configured.') {
    super(message);
    this.name = 'AdminConfigurationError';
  }
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AdminConfigurationError(`Missing required admin environment variable: ${name}`);
  }

  return value;
}

function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    ...extra,
  };
}

export function jsonResponse(statusCode: number, payload: unknown, headers?: Record<string, string>): FunctionResponse {
  return {
    statusCode,
    headers: jsonHeaders(headers),
    body: JSON.stringify(payload),
  };
}

export function optionsResponse(): FunctionResponse {
  return jsonResponse(204, {});
}

export function parseJsonBody(event: FunctionEvent): Record<string, unknown> {
  if (!event.body) return {};

  const parsed = JSON.parse(event.body) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object request body.');
  }

  return parsed as Record<string, unknown>;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64UrlEncodeJson(value: unknown): string {
  return bytesToBase64Url(textEncoder.encode(JSON.stringify(value)));
}

function base64UrlDecodeJson<T>(value: string): T {
  return JSON.parse(textDecoder.decode(base64UrlToBytes(value))) as T;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSignature(value: string): Promise<string> {
  const secret = getEnv('ADMIN_SESSION_SECRET');
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));

  return bytesToBase64Url(new Uint8Array(signature));
}

function normalizePinHash(value: string): string {
  let normalized = value.trim();
  if (normalized.toLowerCase().startsWith('sha256:')) {
    normalized = normalized.slice('sha256:'.length);
  }

  const [digest = ''] = normalized.trim().split(/\s+/u);

  return digest.toLowerCase();
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const expectedHash = normalizePinHash(getEnv('ADMIN_PIN_HASH'));
  const receivedHash = await sha256Hex(pin);

  return constantTimeEqual(receivedHash, expectedHash);
}

export async function createAdminSession(actorLabel: string): Promise<{ token: string; session: AdminSession }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const session: AdminSession = {
    actorLabel: actorLabel.trim() || 'Roegusta admin',
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const payload = base64UrlEncodeJson(session);
  const signature = await hmacSignature(`v1.${payload}`);

  return {
    token: `v1.${payload}.${signature}`,
    session,
  };
}

function getAuthorizationToken(event: FunctionEvent): string | null {
  const headers = event.headers ?? {};
  const authorization = headers.authorization ?? headers.Authorization;
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  return token;
}

export async function readAdminSession(event: FunctionEvent): Promise<AdminSession | null> {
  try {
    const token = getAuthorizationToken(event);
    if (!token) return null;

    const [version, payload, signature] = token.split('.');
    if (version !== 'v1' || !payload || !signature) return null;

    const expectedSignature = await hmacSignature(`${version}.${payload}`);
    if (!constantTimeEqual(signature, expectedSignature)) return null;

    const session = base64UrlDecodeJson<AdminSession>(payload);
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;

    return session;
  } catch {
    return null;
  }
}

export async function requireAdminSession(event: FunctionEvent): Promise<AdminSession | FunctionResponse> {
  const session = await readAdminSession(event);
  if (!session) {
    return jsonResponse(401, {
      error: 'admin_session_required',
      message: 'Sign in with the admin PIN before using admin write endpoints.',
    });
  }

  return session;
}

export async function adminPlaceholderHandler(event: FunctionEvent, functionName: string): Promise<FunctionResponse> {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const session = await requireAdminSession(event);
  if ('statusCode' in session) return session;

  return jsonResponse(202, {
    functionName,
    method: event.httpMethod,
    placeholder: true,
    adminSession: {
      actorLabel: session.actorLabel,
      expiresAt: session.expiresAt,
    },
    todo: 'TODO: perform Supabase write with service role key server-side only and insert audit_log row.',
  });
}
