import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

  const supabase = await createClient();
  const cleanMssv = mssv.trim().toUpperCase();
  const cleanEmail = email ? email.trim().toLowerCase() : `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`;

  const { data: userProfile } = await supabase
    .from('users')
    .select('full_name, class_id')
    .eq('mssv', cleanMssv)
    .single();

  const { data, error } = await supabase
    .from('user_penalties')
    .upsert(
      {
        mssv: cleanMssv,
        email: cleanEmail,
        full_name: userProfile?.full_name || cleanMssv,
        class_id: userProfile?.class_id || 'PTIT-HCM',
        missed_count: 3,
        is_blacklisted: true,
        blacklisted_at: new Date().toISOString(),
        notes: `Khóa thủ công bởi ${auth.email}. Lý do: ${reason}`,
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
