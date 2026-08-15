import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    // Check if current user is an active delegate in class_delegates
    const { data: delegate, error } = await supabase
      .from('class_delegates')
      .select('*')
      .or(`email.eq.${auth.email},mssv.eq.${auth.email.split('@')[0].toUpperCase()}`)
      .eq('is_active', true)
      .gt('expires_at', now)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !delegate) {
      return NextResponse.json({
        success: true,
        data: {
          isDelegate: false,
        },
      });
    }

    const expires = new Date(delegate.expires_at);
    const nowDate = new Date();
    const daysLeft = Math.max(0, Math.ceil((expires.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24)));

    return NextResponse.json({
      success: true,
      data: {
        isDelegate: true,
        class_id: delegate.class_id,
        granted_at: delegate.granted_at,
        expires_at: delegate.expires_at,
        daysLeft,
        full_name: delegate.full_name,
        mssv: delegate.mssv,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
