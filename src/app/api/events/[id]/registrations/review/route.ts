import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, canManageEvent } from '@/lib/supabase/auth-helper';
import { saveRegistrationExtrasBulk, getRegistrationExtras, getEventMeta } from '@/lib/constants/event-meta-store';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';
import { notifyUsersByMssv } from '@/lib/utils/web-push';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import { runSerializedByKey } from '@/lib/utils/concurrency-queue';

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

  const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');
  const allowed = await canManageEvent(auth, resolvedParams.id, undefined, supabase);
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'Bạn không có quyền duyệt nhân sự cho sự kiện này' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const review_status = body.review_status; // 'accepted' | 'rejected' | 'pending'
    const rawMssvs: string[] = Array.isArray(body.mssvs)
      ? body.mssvs
      : body.mssv
      ? [body.mssv]
      : [];
    const targetMssvs = Array.from(
      new Set(rawMssvs.map((m) => String(m || '').trim().toUpperCase()).filter(Boolean))
    );

    if (targetMssvs.length === 0 || !['accepted', 'rejected', 'pending'].includes(String(review_status))) {
      return NextResponse.json({ success: false, error: 'Thiếu danh sách ứng viên hoặc trạng thái phê duyệt' }, { status: 400 });
    }

    return await runSerializedByKey(`reg_review_${resolvedParams.id}`, async () => {
      // 1 & 2. Fetch event/department configurations, target registrations, meta, and extras
      const targetRegs: any[] = [];
      const [{ data: event }, meta, regExtras] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('event_id', resolvedParams.id)
          .single(),
        getEventMeta(supabase, resolvedParams.id),
        getRegistrationExtras(supabase, resolvedParams.id),
      ]);

      for (const mChunk of chunkArray(targetMssvs, 200)) {
        const { data: chunkRegs } = await supabase
          .from('event_registrations')
          .select('*')
          .eq('event_id', resolvedParams.id)
          .in('mssv', mChunk);
        if (chunkRegs) targetRegs.push(...chunkRegs);
      }

      if (event && isEventLockedPast3Days({ ...event, sessions: meta.sessions || [] }) && !isSuperAdmin) {
        return NextResponse.json(
          {
            success: false,
            error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền duyệt nhân sự.',
          },
          { status: 403 }
        );
      }

      if (targetRegs.length === 0) {
        return NextResponse.json({ success: false, error: 'Không tìm thấy hồ sơ của các ứng viên được chọn' }, { status: 404 });
      }

      const departments = (meta.departments && meta.departments.length > 0)
        ? meta.departments
        : (Array.isArray(event?.departments) ? event.departments : []);

      // 3. If approving, validate against Department Quotas using regExtras + DB fallback
      if (review_status === 'accepted' && departments.length > 0) {
        const { data: allEventRegs } = await fetchAllRows<any>(() =>
          supabase
            .from('event_registrations')
            .select('mssv, role_type')
            .eq('event_id', resolvedParams.id)
        );

        const acceptedByDept: Record<string, number> = {};
        for (const r of allEventRegs || []) {
          const cleanM = String(r.mssv || '').trim().toUpperCase();
          const ex = regExtras?.[cleanM];
          const rStatus = ex?.review_status || (r.role_type === 'volunteer' ? 'pending' : '');
          const deptId = ex?.department_id;
          if (rStatus === 'accepted' && deptId) {
            acceptedByDept[deptId] = (acceptedByDept[deptId] || 0) + 1;
          }
        }

        const batchByDept: Record<string, number> = {};
        for (const reg of targetRegs) {
          const cleanM = String(reg.mssv || '').trim().toUpperCase();
          const ex = regExtras?.[cleanM];
          const deptId = ex?.department_id || reg.department_id;
          const rStatus = ex?.review_status || reg.review_status || 'pending';
          if (deptId && rStatus !== 'accepted') {
            batchByDept[deptId] = (batchByDept[deptId] || 0) + 1;
          }
        }

        for (const dept of departments) {
          const limit = Number(dept.quota ?? dept.target_count ?? 0);
          if (!limit || limit <= 0) continue;
          const currentCount = acceptedByDept[dept.id] || 0;
          const newCount = batchByDept[dept.id] || 0;
          if (newCount > 0 && currentCount + newCount > limit) {
            const available = Math.max(0, limit - currentCount);
            return NextResponse.json({
              success: false,
              error: `Vị trí "${dept.name}" chỉ còn ${available} chỉ tiêu trống (Đã duyệt: ${currentCount}/${limit}), không thể duyệt thêm ${newCount} ứng viên cùng lúc! Vui lòng chọn lại số lượng phù hợp.`,
            }, { status: 400 });
          }
        }
      }

      // 4. Bulk-persist review_status in meta store without converting rejected CTVs to participants
      const extrasBulk: Record<string, { review_status: 'pending' | 'accepted' | 'rejected' }> = {};
      for (const m of targetMssvs) {
        extrasBulk[m] = { review_status };
      }
      await saveRegistrationExtrasBulk(supabase, resolvedParams.id, extrasBulk);

      if (review_status === 'accepted') {
        try {
          for (const mChunk of chunkArray(targetMssvs, 200)) {
            await supabase
              .from('event_registrations')
              .update({ role_type: 'volunteer' })
              .eq('event_id', resolvedParams.id)
              .in('mssv', mChunk);
          }
        } catch {}
      }

      const statusText =
        review_status === 'accepted'
          ? 'Duyệt trúng tuyển'
          : review_status === 'rejected'
          ? 'Từ chối'
          : 'Chờ duyệt';

      if (review_status === 'accepted' || review_status === 'rejected') {
        void notifyUsersByMssv(supabase, targetMssvs, {
          title:
            review_status === 'accepted'
              ? '🎉 Chúc mừng bạn đã trúng tuyển CTV!'
              : '📋 Kết quả ứng tuyển CTV',
          body:
            review_status === 'accepted'
              ? `Đơn đăng ký CTV sự kiện "${event?.event_name || 'sự kiện'}" của bạn đã được Ban tổ chức phê duyệt.`
              : `Đơn đăng ký CTV sự kiện "${event?.event_name || 'sự kiện'}" chưa phù hợp đợt này. Hẹn bạn ở chương trình tiếp theo!`,
          url: '/?view=student&tab=registered',
          tag: `ctv-review-${resolvedParams.id}`,
        }).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        data: { count: targetMssvs.length, review_status },
        message: `Đã ${statusText.toLowerCase()} thành công ${targetMssvs.length} ứng viên!`,
      });
    });
  } catch (err: any) {
    console.error('Review registrations error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
