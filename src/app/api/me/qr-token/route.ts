import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { generatePersonalQRToken } from '@/lib/utils/personal-qr';

const WINDOW_SECONDS = 30;
const BATCH_SIZE = 10; // 10 windows = 5 minutes

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const mssv = extractMSSV(auth.email) || auth.email.split('@')[0].toUpperCase();
  const now = Date.now();

  // Generate tokens for current + next 9 windows (5 minutes total)
  const tokens: { token: string; windowStart: number }[] = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const futureMs = now + i * WINDOW_SECONDS * 1000;
    const { token, window: w } = generatePersonalQRToken(mssv, futureMs);
    tokens.push({ token, windowStart: w * WINDOW_SECONDS });
  }

  const { expiresInSeconds } = generatePersonalQRToken(mssv, now);

  return NextResponse.json({
    success: true,
    tokens,
    currentIndex: 0,
    expiresInSeconds,
    windowSeconds: WINDOW_SECONDS,
    refetchAfterSeconds: BATCH_SIZE * WINDOW_SECONDS, // 300s = 5 min
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
