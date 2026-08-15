import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền xóa khỏi Blacklist' }, { status: 403 });
  }

  const { mssv } = await req.json();
  if (!mssv) {
    return NextResponse.json({ success: false, error: 'Thiếu MSSV' }, { status: 400 });
  }

  const supabase = await createClient();

  // Delete penalty record completely so the student is removed from Blacklist table
  const { error } = await supabase
    .from('user_penalties')
    .delete()
    .eq('mssv', mssv.trim().toUpperCase());

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `Đã xóa sinh viên ${mssv} khỏi Danh Sách Đen thành công!`,
  });
}
