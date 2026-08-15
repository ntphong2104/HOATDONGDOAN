import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  const email = session.user.email!;
  
  try {
    const { data: user } = await supabase
      .from('users')
      .select('mssv')
      .eq('email', email)
      .single();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not Found', message: 'User not found' }, { status: 404 });
    }

    const { data: history } = await supabase
      .from('check_ins')
      .select(`
        participate_role,
        created_at,
        events (event_name, semester)
      `)
      .eq('mssv', user.mssv)
      .order('created_at', { ascending: false });

    const formattedHistory = (history || []).map((item: any) => ({
      event_name: item.events?.event_name || 'Không rõ',
      semester: item.events?.semester || 'Không rõ',
      participate_role: item.participate_role,
      checkin_time: item.created_at,
    }));

    return NextResponse.json({ success: true, data: formattedHistory });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: err.message }, { status: 500 });
  }
}
