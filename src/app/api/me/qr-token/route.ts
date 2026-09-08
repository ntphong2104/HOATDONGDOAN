import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { deriveClientKey } from '@/lib/utils/personal-qr';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const mssv = extractMSSV(auth.email) || auth.email.split('@')[0].toUpperCase();
  const clientKey = deriveClientKey(mssv);

  return NextResponse.json({
    success: true,
    mssv,
    clientKey,
  }, {
    headers: {
      'Cache-Control': 'private, max-age=300', // Cache 5 minutes — clientKey doesn't change
    },
  });
}
