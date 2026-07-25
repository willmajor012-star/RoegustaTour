import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './_supabase';

declare const process: { env: Record<string, string | undefined> };

export type PublicAccessEvent = { headers?: Record<string, string | undefined>; httpMethod?: string; body?: string | null };
export type PublicAccessResponse = { statusCode: number; headers?: Record<string, string>; body: string };

type PublicAccessSetting = {
  password_hash: string | null;
  password_salt: string | null;
  session_version: number | null;
  requires_change: boolean | null;
};

const COOKIE_NAME = 'rt_public_access';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function json(statusCode: number, payload: unknown, headers?: Record<string, string>): PublicAccessResponse {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(payload) };
}

function bytesToHex(bytes: Uint8Array) { return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function bytesToBase64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, ''); }
function base64UrlToBytes(value: string) { const normalized = value.replace(/-/g, '+').replace(/_/g, '/'); const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='); return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)); }
function encodeJson(value: unknown) { return bytesToBase64Url(textEncoder.encode(JSON.stringify(value))); }
function decodeJson<T>(value: string): T { return JSON.parse(textDecoder.decode(base64UrlToBytes(value))) as T; }
function constantTimeEqual(left: string, right: string) { if (left.length !== right.length) return false; let diff = 0; for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index); return diff === 0; }

async function sha256Hex(value: string) { const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value)); return bytesToHex(new Uint8Array(digest)); }
export async function hashPublicPassword(password: string, salt: string) { return sha256Hex(`${salt}:${password}`); }
export function createPasswordSalt() { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return bytesToHex(bytes); }

function secret() {
  const value = process.env.TOUR_PUBLIC_ACCESS_SECRET;
  if (!value) throw new Error('Missing required public access environment variable: TOUR_PUBLIC_ACCESS_SECRET');
  return value;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))));
}

export async function getPublicAccessSetting(supabase: SupabaseClient): Promise<{ configured: boolean; requiresChange: boolean; passwordHash: string; passwordSalt: string; sessionVersion: number }> {
  const { data, error } = await supabase.from('public_access_settings').select('password_hash, password_salt, session_version, requires_change').eq('id', 'default').maybeSingle<PublicAccessSetting>();
  if (error) {
    if (/requires_change/i.test(error.message)) {
      throw new Error('Public access needs the live-readiness database migration. Apply 202607250001_live_readiness_transactions.sql.');
    }
    const missingSettingsTable = /(relation|table).*public_access_settings.*does not exist|could not find the table.*public_access_settings/i.test(error.message);
    if (!missingSettingsTable) throw new Error(`load public access setting: ${error.message}`);
  }
  if (data?.password_hash && data.password_salt) {
    return {
      configured: true,
      requiresChange: data.requires_change ?? false,
      passwordHash: data.password_hash,
      passwordSalt: data.password_salt,
      sessionVersion: data.session_version ?? 1,
    };
  }
  throw new Error('Public access is not configured. Set a password in Admin → Settings.');
}

export async function verifyPublicPassword(supabase: SupabaseClient, password: string) {
  const setting = await getPublicAccessSetting(supabase);
  const received = await hashPublicPassword(password, setting.passwordSalt);
  return {
    ok: constantTimeEqual(received, setting.passwordHash),
    sessionVersion: setting.sessionVersion,
    configured: setting.configured,
    requiresChange: setting.requiresChange,
  };
}

function readCookie(event: PublicAccessEvent) {
  const cookie = event.headers?.cookie ?? event.headers?.Cookie ?? '';
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}

function cookieHeader(token: string, maxAge = SESSION_TTL_SECONDS) {
  const secure = process.env.CONTEXT === 'production' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export async function createPublicAccessCookie(sessionVersion: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeJson({ iat: now, exp: now + SESSION_TTL_SECONDS, sv: sessionVersion });
  const signature = await sign(`v1.${payload}`);
  return cookieHeader(`v1.${payload}.${signature}`);
}

export function clearPublicAccessCookie() { return cookieHeader('', 0); }

export async function readPublicAccessSession(event: PublicAccessEvent, supabase = createServerSupabaseClient()) {
  const token = readCookie(event);
  if (!token) return null;
  const [version, payload, signature] = token.split('.');
  if (version !== 'v1' || !payload || !signature) return null;
  const expected = await sign(`${version}.${payload}`);
  if (!constantTimeEqual(signature, expected)) return null;
  const session = decodeJson<{ exp: number; sv: number }>(payload);
  if (session.exp <= Math.floor(Date.now() / 1000)) return null;
  const setting = await getPublicAccessSetting(supabase);
  if (session.sv !== setting.sessionVersion) return null;
  return session;
}

export async function requirePublicAccess(event: PublicAccessEvent, supabase: SupabaseClient): Promise<PublicAccessResponse | null> {
  try {
    return await readPublicAccessSession(event, supabase) ? null : json(401, { ok: false, error: 'public_access_required', message: 'Enter the tour password to continue.' });
  } catch (error) {
    return json(503, { ok: false, error: 'public_access_configuration_error', message: error instanceof Error ? error.message : 'Public access is not configured.' });
  }
}
