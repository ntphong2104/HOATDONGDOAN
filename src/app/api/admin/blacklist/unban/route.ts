import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền xóa khỏi Blacklist' }, { status: 403 });
  }

  const { mssv, reason, hard_delete } = await req.json();
  if (!mssv) {
    return NextResponse.json({ success: false, error: 'Thiếu MSSV' }, { status: 400 });
  }

  const supabase = await createClient();
  const cleanMssv = mssv.trim().toUpperCase();

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

    const note = `[Đã mở khóa] Lý do: ${reason || 'Super Admin xóa khỏi Blacklist'} (Bởi ${auth.email} lúc ${new Date().toLocaleString('vi-VN')})`;
    const updatedNotes = existing?.notes ? `${existing.notes}; ${note}` : note;

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
