import { NextResponse } from 'next/server';
import { appOrigin, createOAuthState, googleRedirectUri, setOAuthStateCookie } from '@/lib/unconscious-auth';

export const runtime = 'nodejs';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID가 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const state = createOAuthState();
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', googleRedirectUri());
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('prompt', 'select_account');

    const response = NextResponse.redirect(authorizationUrl);
    setOAuthStateCookie(response, state);
    return response;
  } catch (error) {
    console.error('Unable to start Google OAuth:', error);
    return NextResponse.redirect(new URL('/?authError=configuration', appOrigin()));
  }
}
