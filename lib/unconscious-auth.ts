import { NextRequest, NextResponse } from 'next/server';

const TOKEN_HEADER = 'x-brain-history-token';

/**
 * Browsing history is more sensitive than ordinary knowledge documents.
 * All related endpoints require an explicit shared token that remains on the
 * server and is manually supplied to the personal extension/dashboard.
 */
export function requireHistoryToken(request: NextRequest): NextResponse | null {
  const expected = process.env.BROWSER_HISTORY_INGEST_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: 'BROWSER_HISTORY_INGEST_TOKEN is not configured. Browsing-history collection stays disabled until it is set.' },
      { status: 503 },
    );
  }

  const supplied = request.headers.get(TOKEN_HEADER);
  if (!supplied || supplied.length !== expected.length) {
    return NextResponse.json({ error: 'Unauthorized browsing-history request.' }, { status: 401 });
  }

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (!cryptoSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized browsing-history request.' }, { status: 401 });
  }

  return null;
}

function cryptoSafeEqual(a: Buffer, b: Buffer): boolean {
  // Buffer#equals leaks less information than string equality, and explicit
  // length validation above avoids an exception for mismatched buffers.
  return a.equals(b);
}

export const HISTORY_TOKEN_HEADER = TOKEN_HEADER;
