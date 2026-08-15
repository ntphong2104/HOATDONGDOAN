import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    // Verify active delegation
    const { data: delegate } = await supabase
      .from('class_delegates')
      .select('*')
      .or(`email.eq.${auth.email},mssv.eq.${auth.email.split('@')[0].toUpperCase()}`)
      .eq('is_active', true)
      .gt('expires_at', now)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!delegate) {
      return NextResponse.json(
        { success: false, error: 'Quyền tra cứu Ban cán sự lớp của bạn đã hết hạn hoặc chưa được cấp' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    let dbQuery = supabase
      .from('users')
      .select('mssv, full_name, class_id, email')
      .eq('class_id', delegate.class_id)
      .order('mssv', { ascending: true });

    if (query) {
      dbQuery = dbQuery.or(`mssv.ilike.%${query}%,full_name.ilike.%${query}%,email.ilike.%${query}%`);
    }

    const { data: classStudents, error } = await dbQuery.limit(500);

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    // Fetch check-in counts for these students in this class
    const mssvList = (classStudents || []).map((s) => s.mssv);
    let checkInCounts: Record<string, number> = {};

    if (mssvList.length > 0) {
      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('mssv')
        .in('mssv', mssvList);

      if (checkIns) {
        for (const ci of checkIns) {
          checkInCounts[ci.mssv] = (checkInCounts[ci.mssv] || 0) + 1;
        }
      }
    }

    const results = (classStudents || []).map((s, idx) => ({
      stt: idx + 1,
      mssv: s.mssv,
      full_name: s.full_name,
      class_id: s.class_id,
      email: s.email,
      total_attended: checkInCounts[s.mssv] || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        class_id: delegate.class_id,
        expires_at: delegate.expires_at,
        students: results,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
