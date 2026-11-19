import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth } from '@/lib/utils/office-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const { data, error } = await supabase
      .from('office_borrow_bans')
      .select('*')
      .order('banned_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi tải danh sách cấm mượn' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu ID lệnh cấm.' }, { status: 400 });

    const supabase = (await createAdminClient()) || (await createClient());
    const { error } = await supabase
      .from('office_borrow_bans')
      .update({
        is_active: false,
        unbanned_by: auth!.email,
        unbanned_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Đã gỡ cấm mượn dụng cụ cho đơn vị.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi gỡ cấm mượn' }, { status: 500 });
  }
}
