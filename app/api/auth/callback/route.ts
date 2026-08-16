import { OAuth2Client } from 'google-auth-library';
import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import {
  appOrigin,
  clearOAuthStateCookie,
  createSession,
  googleRedirectUri,
  oauthStateFromRequest,
  setSessionCookie,
  verifyOAuthState,
} from '@/lib/unconscious-auth';
import { ensureUnconsciousUserState } from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

function failureRedirect(code: string, request: NextRequest) {
  return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(code)}`, appOrigin(request)));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const savedState = oauthStateFromRequest(request);
  if (!code || !state || !savedState || !verifyOAuthState(state) || !verifyOAuthState(savedState) || state !== savedState) {
    const response = failureRedirect('state', request);
    clearOAuthStateCookie(response, request);
    return response;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    const response = failureRedirect('configuration', request);
    clearOAuthStateCookie(response, request);
    return response;
  }

  try {
    const client = new OAuth2Client(clientId, clientSecret, googleRedirectUri(request));
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error('Google did not return an ID token.');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new Error('A verified Google email address is required.');
    }

    await database().query(
      `INSERT INTO users (id, email, name, picture, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         picture = EXCLUDED.picture,
         updated_at = NOW()`,
      [payload.sub, payload.email, payload.name || null, payload.picture || null],
    );
    await ensureUnconsciousUserState(payload.sub);
    const session = await createSession(payload.sub);

    const response = NextResponse.redirect(new URL('/', appOrigin(request)));
    clearOAuthStateCookie(response, request);
    setSessionCookie(response, session.token, session.expiresAt, request);
    return response;
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    const response = failureRedirect('oauth', request);
    clearOAuthStateCookie(response, request);
    return response;
  }
}
