import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { pardonAllInNotes } from '@/lib/utils/blacklist-logic';

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền xóa khỏi Blacklist' }, { status: 403 });
  }

  const { mssv, reason, hard_delete } = await req.json();
  if (!mssv) {
    return NextResponse.json({ success: false, error: 'Thiếu MSSV' }, { status: 400 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());
  const cleanMssv = String(mssv).trim().toUpperCase();

  if (hard_delete) {
    const { error } = await supabase
      .from('user_penalties')
      .delete()
      .eq('mssv', cleanMssv);

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
    }
  } else {
    const { data: existing } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', cleanMssv)
      .maybeSingle();

    const nowVn = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const cleanReason = reason || 'Super Admin xóa khỏi Blacklist';
    const updatedNotes = existing?.notes
      ? pardonAllInNotes({
          notesStr: existing.notes,
          reason: cleanReason,
          adminEmail: auth.email,
          nowFormatted: nowVn,
        })
      : `[Đã mở khóa] Lý do: ${cleanReason} (Bởi ${auth.email} lúc ${nowVn})`;

    const { error } = await supabase
      .from('user_penalties')
      .update({
        missed_count: 0,
        is_blacklisted: false,
        unbanned_at: new Date().toISOString(),
        unbanned_by: auth.email,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('mssv', cleanMssv);

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Đã xóa sinh viên ${cleanMssv} khỏi Danh Sách Đen thành công!`,
  });
}
