import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';

const SESSION_COOKIE = 'amy_brain_map_session';
const OAUTH_STATE_COOKIE = 'amy_brain_map_oauth_state';
const EXTENSION_TOKEN_HEADER = 'x-brain-installation-token';
const SESSION_TTL_DAYS = 30;
const CONNECT_CODE_TTL_MINUTES = 10;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface ExtensionInstallationAuth {
  userId: string;
  installationRecordId: string;
  installationId: string;
}

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error('AUTH_SESSION_SECRET must be configured with at least 32 characters.');
  }
  return value;
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function configuredAppOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  return configured || null;
}

function secureCookie(request?: NextRequest) {
  return appOrigin(request).startsWith('https://');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function appOrigin(request?: NextRequest): string {
  // OAuth redirects must return to the exact deployed host that received the request.
  // This keeps renamed Vercel projects and connected custom domains from falling back
  // to an old NEXT_PUBLIC_APP_URL value.
  return request?.nextUrl.origin || configuredAppOrigin() || 'http://localhost:3000';
}

export function googleRedirectUri(request?: NextRequest): string {
  return `${appOrigin(request)}/api/auth/callback`;
}

export function createOAuthState(): string {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(nonce).digest('base64url');
  return `${nonce}.${signature}`;
}

export function verifyOAuthState(value: string | undefined): boolean {
  if (!value) return false;
  const [nonce, suppliedSignature, ...rest] = value.split('.');
  if (!nonce || !suppliedSignature || rest.length > 0) return false;
  const expectedSignature = crypto.createHmac('sha256', secret()).update(nonce).digest('base64url');
  return safeEqual(suppliedSignature, expectedSignature);
}

export function setOAuthStateCookie(response: NextResponse, state: string, request?: NextRequest) {
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
}

export function clearOAuthStateCookie(response: NextResponse, request?: NextRequest) {
  response.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function oauthStateFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(OAUTH_STATE_COOKIE)?.value;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const sql = database();
  await sql.transaction((tx) => [
    tx.query('DELETE FROM user_sessions WHERE user_id = $1 AND expires_at <= NOW()', [userId]),
    tx.query(
      'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [hash(token), userId, expiresAt.toISOString()],
    ),
  ]);
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date, request?: NextRequest) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await database().query('DELETE FROM user_sessions WHERE token_hash = $1', [hash(token)]);
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSessionUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await database().query(
    `SELECT users.id, users.email, users.name, users.picture
     FROM user_sessions
     JOIN users ON users.id = user_sessions.user_id
     WHERE user_sessions.token_hash = $1 AND user_sessions.expires_at > NOW()
     LIMIT 1`,
    [hash(token)],
  );
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    email: String(row.email),
    name: typeof row.name === 'string' ? row.name : null,
    picture: typeof row.picture === 'string' ? row.picture : null,
  };
}

export async function requireUser(request: NextRequest): Promise<{ user: AuthenticatedUser } | { response: NextResponse }> {
  try {
    const user = await getSessionUser(request);
    if (!user) return { response: NextResponse.json({ error: 'Google 로그인이 필요합니다.' }, { status: 401 }) };
    return { user };
  } catch (error) {
    console.error('Session verification failed:', error);
    return { response: NextResponse.json({ error: '로그인 세션을 확인할 수 없습니다.' }, { status: 503 }) };
  }
}

export function generateConnectCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  const segments = Array.from(bytes, (value) => alphabet[value % alphabet.length]);
  return `ABM-${segments.slice(0, 4).join('')}-${segments.slice(4, 8).join('')}-${segments.slice(8, 12).join('')}`;
}

export async function issueConnectCode(userId: string): Promise<{ code: string; expiresAt: string }> {
  const code = generateConnectCode();
  const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_MINUTES * 60 * 1000);
  await database().query(
    `INSERT INTO extension_installations (id, user_id, installation_id, connect_code_hash, connect_code_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (installation_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       connect_code_hash = EXCLUDED.connect_code_hash,
       connect_code_expires_at = EXCLUDED.connect_code_expires_at,
       access_token_hash = NULL,
       connected_at = NULL,
       updated_at = NOW()`,
    [crypto.randomUUID(), userId, `pending-${crypto.randomUUID()}`, hash(code), expiresAt.toISOString()],
  );
  return { code, expiresAt: expiresAt.toISOString() };
}

/** Exchanges one expiring dashboard code for an installation-bound credential. */
export async function connectExtension(connectCode: string, installationId: string): Promise<{ token: string; userId: string } | null> {
  const rows = await database().query(
    `SELECT id, user_id FROM extension_installations
     WHERE connect_code_hash = $1
       AND connect_code_expires_at > NOW()
       AND connected_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [hash(connectCode)],
  );
  if (!rows[0]) return null;

  const record = rows[0] as Record<string, unknown>;
  const pendingId = String(record.id);
  const userId = String(record.user_id);
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const existingRows = await database().query(
    `SELECT id FROM extension_installations
     WHERE installation_id = $1
       AND id <> $2
     LIMIT 1`,
    [installationId, pendingId],
  );

  if (existingRows[0]) {
    const existingId = String((existingRows[0] as Record<string, unknown>).id);
    await database().query(
      `UPDATE extension_installations
       SET user_id = $2,
           access_token_hash = $3,
           connect_code_hash = NULL,
           connect_code_expires_at = NULL,
           connected_at = NOW(),
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [existingId, userId, tokenHash],
    );
    await database().query('DELETE FROM extension_installations WHERE id = $1', [pendingId]);
  } else {
    await database().query(
      `UPDATE extension_installations
       SET installation_id = $2,
           access_token_hash = $3,
           connect_code_hash = NULL,
           connect_code_expires_at = NULL,
           connected_at = NOW(),
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [pendingId, installationId, tokenHash],
    );
  }

  return { token, userId };
}

export async function requireExtensionInstallation(request: NextRequest, installationId: string): Promise<{ installation: ExtensionInstallationAuth } | { response: NextResponse }> {
  const token = request.headers.get(EXTENSION_TOKEN_HEADER)?.trim();
  if (!token || !installationId) {
    return { response: NextResponse.json({ error: 'Chrome 확장 프로그램 연결 권한이 필요합니다.' }, { status: 401 }) };
  }
  const rows = await database().query(
    `SELECT id, user_id, installation_id FROM extension_installations
     WHERE installation_id = $1
       AND access_token_hash = $2
       AND connected_at IS NOT NULL
     LIMIT 1`,
    [installationId, hash(token)],
  );
  if (!rows[0]) return { response: NextResponse.json({ error: 'Chrome 확장 프로그램 연결이 만료되었거나 유효하지 않습니다.' }, { status: 401 }) };
  const row = rows[0] as Record<string, unknown>;
  return {
    installation: {
      installationRecordId: String(row.id),
      userId: String(row.user_id),
      installationId: String(row.installation_id),
    },
  };
}

export const HISTORY_INSTALLATION_TOKEN_HEADER = EXTENSION_TOKEN_HEADER;
