import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { saveRegistrationExtra } from '@/lib/constants/event-meta-store';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  const isYouthUnion = auth.tier === 'youth_union';

  if (!isSuperAdmin && !isYouthUnion && auth.tier !== 'event_admin') {
    const { data: eventRole } = await supabase
      .from('event_roles')
      .select('role_type')
      .eq('email', auth.email)
      .eq('event_id', resolvedParams.id)
      .maybeSingle();

    const { data: event } = await supabase
      .from('events')
      .select('created_by')
      .eq('event_id', resolvedParams.id)
      .maybeSingle();

    const isCreator = event?.created_by && event.created_by.toLowerCase() === auth.email.toLowerCase();

    if (!eventRole && !isCreator) {
      return NextResponse.json({ success: false, error: 'Bạn không có quyền duyệt nhân sự cho sự kiện này' }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const review_status = body.review_status; // 'accepted' | 'rejected' | 'pending'
    const targetMssvs: string[] = Array.isArray(body.mssvs)
      ? body.mssvs
      : body.mssv
      ? [body.mssv]
      : [];

    if (targetMssvs.length === 0 || !review_status) {
      return NextResponse.json({ success: false, error: 'Thiếu danh sách ứng viên hoặc trạng thái phê duyệt' }, { status: 400 });
    }

    // 1. Fetch event and department configurations
    const { data: event } = await supabase
      .from('events')
      .select('*')
      .eq('event_id', resolvedParams.id)
      .single();

    // 2. Fetch target registrations to check which departments they belong to
    const { data: targetRegs } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', resolvedParams.id)
      .in('mssv', targetMssvs);

    if (!targetRegs || targetRegs.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hồ sơ của các ứng viên được chọn' }, { status: 404 });
    }

    // 3. If approving, validate against Department Quotas
    if (review_status === 'accepted' && event?.departments && Array.isArray(event.departments)) {
      // Fetch all currently accepted registrations
      const { data: currentAccepted } = await supabase
        .from('event_registrations')
        .select('mssv, department_id')
        .eq('event_id', resolvedParams.id)
        .eq('review_status', 'accepted');

      const acceptedByDept: Record<string, number> = {};
      for (const reg of currentAccepted || []) {
        if (reg.department_id) {
          acceptedByDept[reg.department_id] = (acceptedByDept[reg.department_id] || 0) + 1;
        }
      }

      // Count how many from this batch belong to each department (exclude those already accepted)
      const batchByDept: Record<string, number> = {};
      for (const reg of targetRegs) {
        if (reg.department_id && reg.review_status !== 'accepted') {
          batchByDept[reg.department_id] = (batchByDept[reg.department_id] || 0) + 1;
        }
      }

      // Check quota limits
      for (const dept of event.departments) {
        const currentCount = acceptedByDept[dept.id] || 0;
        const newCount = batchByDept[dept.id] || 0;
        const totalAfter = currentCount + newCount;

        if (dept.quota && totalAfter > dept.quota) {
          const available = Math.max(0, dept.quota - currentCount);
          return NextResponse.json({
            success: false,
            error: `Vị trí "${dept.name}" chỉ còn ${available} chỉ tiêu trống (Đã duyệt: ${currentCount}/${dept.quota}), không thể duyệt thêm ${newCount} ứng viên cùng lúc! Vui lòng chọn lại số lượng phù hợp.`,
          }, { status: 400 });
        }
      }
    }

    // 4. Update the registrations in meta store and database
    for (const m of targetMssvs) {
      await saveRegistrationExtra(supabase, resolvedParams.id, m, { review_status });
    }

    try {
      await supabase
        .from('event_registrations')
        .update({ role_type: review_status === 'accepted' ? 'volunteer' : 'participant' })
        .eq('event_id', resolvedParams.id)
        .in('mssv', targetMssvs);
    } catch {}

    const statusText =
      review_status === 'accepted'
        ? 'Duyệt trúng tuyển'
        : review_status === 'rejected'
        ? 'Từ chối'
        : 'Chờ duyệt';

    return NextResponse.json({
      success: true,
      data: { count: targetMssvs.length, review_status },
      message: `Đã ${statusText.toLowerCase()} thành công ${targetMssvs.length} ứng viên!`,
    });
  } catch (err: any) {
    console.error('Review registrations error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
