import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền thêm vào Blacklist' }, { status: 403 });
  }

  const { mssv, email, reason = 'Vi phạm kỷ luật' } = await req.json();
  if (!mssv) {
    return NextResponse.json({ success: false, error: 'Thiếu MSSV' }, { status: 400 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());
  const cleanMssv = String(mssv).trim().toUpperCase();
  const cleanEmail = email ? String(email).trim().toLowerCase() : `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`;

  const [{ data: userProfile }, { data: existing }] = await Promise.all([
    supabase
      .from('users')
      .select('full_name, class_id')
      .eq('mssv', cleanMssv)
      .maybeSingle(),
    supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', cleanMssv)
      .maybeSingle(),
  ]);

  const banNote = `Khóa thủ công bởi ${auth.email}. Lý do: ${String(reason || 'Vi phạm kỷ luật').trim()}`;
  const updatedNotes = existing?.notes ? `${existing.notes}; ${banNote}` : banNote;
  const preservedMissed = Math.max(Number(existing?.missed_count) || 0, 3);

  const { data, error } = await supabase
    .from('user_penalties')
    .upsert(
      {
        mssv: cleanMssv,
        email: cleanEmail || existing?.email,
        full_name: userProfile?.full_name || existing?.full_name || cleanMssv,
        class_id: userProfile?.class_id || existing?.class_id || 'PTIT-HCM',
        missed_count: preservedMissed,
        is_blacklisted: true,
        blacklisted_at: existing?.blacklisted_at || new Date().toISOString(),
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'mssv' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data,
    message: `Đã đưa sinh viên ${cleanMssv} vào Danh Sách Đen thành công!`,
  });
}
