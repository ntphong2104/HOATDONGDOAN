import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('class_delegates')
      .select('*')
      .order('granted_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    const now = new Date();
    const delegates = (data || []).map((d: any) => {
      const expires = new Date(d.expires_at);
      const isExpired = expires < now;
      const daysLeft = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        ...d,
        isExpired,
        daysLeft,
        status: !d.is_active ? 'revoked' : isExpired ? 'expired' : 'active',
      };
    });

    return NextResponse.json({ success: true, data: delegates });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mssv, notes } = body;

    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập MSSV sinh viên' }, { status: 400 });
    }

    const cleanMssv = String(mssv).trim().toUpperCase();
    const supabase = await createClient();

    // Look up student in users table
    const { data: student, error: studentErr } = await supabase
      .from('users')
      .select('*')
      .eq('mssv', cleanMssv)
      .maybeSingle();

    if (studentErr || !student) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy sinh viên có MSSV ${cleanMssv} trong hệ thống` },
        { status: 404 }
      );
    }

    if (!student.class_id || student.class_id === 'Chưa phân lớp') {
      return NextResponse.json(
        { success: false, error: `Sinh viên ${student.full_name} (${cleanMssv}) chưa có thông tin Lớp sinh hoạt` },
        { status: 400 }
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    // Upsert into class_delegates
    const { data: newDelegate, error: insertErr } = await supabase
      .from('class_delegates')
      .insert({
        mssv: cleanMssv,
        email: student.email,
        full_name: student.full_name,
        class_id: student.class_id,
        granted_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by: auth.email || 'Super Admin',
        is_active: true,
        notes: notes || `Cấp quyền BCS lớp tra cứu chấm ĐRL lớp ${student.class_id} (thời hạn 1 tháng)`,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Đã cấp quyền tra cứu ĐRL Lớp ${student.class_id} cho sinh viên ${student.full_name} (${cleanMssv}) thời hạn 30 ngày (1 tháng)!`,
      data: newDelegate,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID ủy quyền' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from('class_delegates').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Đã thu hồi quyền Ban cán sự lớp' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
