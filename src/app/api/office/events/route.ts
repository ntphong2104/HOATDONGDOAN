import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, invalidateAuthContextCache } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth } from '@/lib/utils/office-auth';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeInput } from '@/lib/security/sanitizer';
import {
  getEventMetaBatch,
  saveEventMeta,
  invalidateEventCache,
  type EventSession,
} from '@/lib/constants/event-meta-store';
import { getAcademicSemesters } from '@/lib/utils/semesters';
import { isEventPastDeadline, normalizeCancellationPolicy } from '@/lib/utils/event-logic';
import { normalizeAllowedCohorts } from '@/lib/utils/cohort';
import { normalizeAllowedLcds } from '@/lib/utils/lcd';
import { notifyStudentsByScope } from '@/lib/utils/web-push';

export const dynamic = 'force-dynamic';

function canManageSupportEvents(auth: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  if (!auth) return false;
  return isOfficeAdminAuth(auth) || auth.tier === 'youth_union';
}

function getTodayVN(): string {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vnNow.toISOString().split('T')[0];
}

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageSupportEvents(auth)) {
    return NextResponse.json(
      { success: false, error: 'Chỉ Văn phòng Đoàn, BCH Đoàn Học viện hoặc Super Admin mới có quyền truy cập.' },
      { status: 403 }
    );
  }

  try {
    const supabase =
      (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) ||
      (await createClient());

    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ success: false, error: 'Không thể tải danh sách sự kiện hỗ trợ.' }, { status: 500 });
    }

    const list = events || [];
    const ids = list.map((e: any) => e.event_id).filter(Boolean);
    const metaMap = ids.length > 0 ? await getEventMetaBatch(supabase, ids) : {};

    const supportEvents = list
      .filter((ev: any) => {
        const meta = metaMap[ev.event_id];
        return Boolean(meta?.is_support_event);
      })
      .map((ev: any) => {
        const meta = metaMap[ev.event_id] || {};
        const sessions = meta.sessions || [];
        return {
          ...ev,
          sessions,
          max_participants: meta.max_participants || 0,
          max_volunteers: meta.max_volunteers || 0,
          is_recruitment_open: Boolean(meta.is_recruitment_open),
          require_registration: meta.require_registration !== false,
          allowed_lcds: meta.allowed_lcds || [],
          organization_unit: meta.organization_unit || 'Văn phòng Đoàn Học Viện',
          description: meta.description || '',
          is_support_event: true,
          is_past_deadline: isEventPastDeadline({ ...ev, sessions }),
        };
      });

    return NextResponse.json({ success: true, data: supportEvents });
  } catch (err) {
    console.error('GET /api/office/events error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ khi tải sự kiện hỗ trợ.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập.' }, { status: 401 });
  }
  if (!canManageSupportEvents(auth)) {
    return NextResponse.json(
      { success: false, error: 'Chỉ Văn phòng Đoàn, BCH Đoàn Học viện hoặc Super Admin mới có quyền tạo sự kiện hỗ trợ nhanh.' },
      { status: 403 }
    );
  }

  const rl = checkRateLimit(`office_event_create_${auth.email}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: `Thao tác quá nhanh, vui lòng thử lại sau ${rl.resetInSeconds} giây.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } }
    );
  }

  try {
    const body = await req.json();
    const {
      event_name,
      organization_unit = 'Văn phòng Đoàn Học Viện',
      description = '',
      semester = '',
      event_date,
      end_date,
      start_time = '07:30',
      end_time = '11:30',
      participant_count = 0,
      volunteer_count = 0,
      require_registration,
      allowed_cohorts = [],
      allowed_lcds = [],
      sessions = [],
      notify_students = false,
      cancellation_policy = 'before_2h',
    } = body || {};

    const cleanName = sanitizeInput(String(event_name || '')).trim();
    if (!cleanName) {
      return NextResponse.json({ success: false, error: 'Tên sự kiện hỗ trợ không được để trống.' }, { status: 400 });
    }

    const cleanOrg = sanitizeInput(String(organization_unit || 'Văn phòng Đoàn Học Viện')).trim() || 'Văn phòng Đoàn Học Viện';
    const cleanDesc = description ? sanitizeInput(String(description).slice(0, 3000)).trim() : '';

    const todayVN = getTodayVN();
    const finalStartDate = String(event_date || todayVN).trim();
    const finalEndDate = String(end_date || finalStartDate).trim();
    const finalStartTime = String(start_time || '07:30').trim();
    const finalEndTime = String(end_time || '11:30').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(finalEndDate)) {
      return NextResponse.json({ success: false, error: 'Định dạng ngày không hợp lệ.' }, { status: 400 });
    }
    if (finalStartDate < todayVN) {
      return NextResponse.json(
        { success: false, error: 'Ngày tổ chức không thể ở trong quá khứ.' },
        { status: 400 }
      );
    }
    if (finalEndDate < finalStartDate) {
      return NextResponse.json(
        { success: false, error: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.' },
        { status: 400 }
      );
    }
    if (finalEndDate === finalStartDate && finalEndTime <= finalStartTime) {
      return NextResponse.json(
        { success: false, error: 'Giờ kết thúc phải sau giờ bắt đầu.' },
        { status: 400 }
      );
    }

    const maxParticipants = Math.max(0, Math.min(5000, parseInt(String(participant_count), 10) || 0));
    const maxVolunteers = Math.max(0, Math.min(1000, parseInt(String(volunteer_count), 10) || 0));
    const normalizedCohorts = normalizeAllowedCohorts(allowed_cohorts);
    const normalizedLcds = normalizeAllowedLcds(allowed_lcds);

    const supabase =
      (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) ||
      (await createClient());

    // Resolve semester automatically from active semester if not provided
    let resolvedSemester = sanitizeInput(String(semester || '')).trim();
    if (!resolvedSemester) {
      try {
        const semesters = await getAcademicSemesters(supabase);
        const activeSem = semesters.find((s) => s.is_active) || semesters[0];
        resolvedSemester = activeSem?.name || 'Chưa xếp kỳ';
      } catch {
        resolvedSemester = 'Chưa xếp kỳ';
      }
    }

    // Build sessions — strictly NO room borrowing (room_id: null, room_name: 'Không mượn')
    const nowIso = new Date().toISOString();
    let finalSessions: EventSession[] = [];
    if (Array.isArray(sessions) && sessions.length > 0) {
      finalSessions = sessions
        .filter((s: any) => s && String(s.name || '').trim() && String(s.session_date || '').trim())
        .slice(0, 30)
        .map((s: any, idx: number) => ({
          id: String(s.id || `session_${idx + 1}`),
          name: sanitizeInput(String(s.name)).trim(),
          session_date: String(s.session_date).trim(),
          start_time: String(s.start_time || finalStartTime).trim(),
          end_time: String(s.end_time || finalEndTime).trim(),
          room_id: null,
          room_name: 'Không mượn',
          session_type: s.session_type === 'internal' ? 'internal' : 'participant',
          is_main: Boolean(s.is_main),
          created_at: nowIso,
        }));
    }

    if (finalSessions.length === 0) {
      if (finalEndDate > finalStartDate) {
        const cur = new Date(`${finalStartDate}T12:00:00Z`);
        const end = new Date(`${finalEndDate}T12:00:00Z`);
        let dayIdx = 1;
        while (cur <= end && dayIdx <= 30) {
          const dStr = cur.toISOString().split('T')[0];
          const p = dStr.split('-');
          finalSessions.push({
            id: `session_day_${dayIdx}`,
            name: `Buổi ${dayIdx} (${p[2]}/${p[1]})`,
            session_date: dStr,
            start_time: finalStartTime,
            end_time: finalEndTime,
            room_id: null,
            room_name: 'Không mượn',
            created_at: nowIso,
          });
          cur.setUTCDate(cur.getUTCDate() + 1);
          dayIdx++;
        }
      } else {
        finalSessions.push({
          id: 'session_1',
          name: 'Buổi 1 (Buổi chính)',
          session_date: finalStartDate,
          start_time: finalStartTime,
          end_time: finalEndTime,
          room_id: null,
          room_name: 'Không mượn',
          created_at: nowIso,
        });
      }
    }

    // Create active event immediately — bypasses CTSV and Facility approval
    const { data: newEvent, error: createErr } = await supabase
      .from('events')
      .insert({
        event_name: cleanName,
        event_date: finalStartDate,
        start_time: finalStartTime,
        end_time: finalEndTime,
        semester: resolvedSemester,
        status: 'active',
        is_active: true,
        is_registration_open: maxParticipants > 0,
        created_by: auth.email,
        allowed_cohorts: normalizedCohorts.length > 0 ? normalizedCohorts : null,
      })
      .select()
      .single();

    if (createErr || !newEvent?.event_id) {
      console.error('POST /api/office/events insert error:', createErr);
      return NextResponse.json(
        { success: false, error: createErr?.message || 'Không thể tạo sự kiện hỗ trợ.' },
        { status: 500 }
      );
    }

    const finalRequireReg =
      typeof require_registration === 'boolean' ? require_registration : maxParticipants > 0;

    await Promise.all([
      saveEventMeta(supabase, newEvent.event_id, {
        departments: [],
        target_scope: 'all',
        allowed_lcds: normalizedLcds,
        sessions: finalSessions,
        is_recruitment_open: maxVolunteers > 0,
        require_registration: finalRequireReg,
        max_participants: maxParticipants,
        max_volunteers: maxVolunteers,
        is_support_event: true,
        organization_unit: cleanOrg,
        description: cleanDesc || undefined,
        cancellation_policy: normalizeCancellationPolicy(cancellation_policy),
      }),
      supabase.from('event_roles').insert({
        event_id: newEvent.event_id,
        email: auth.email,
        role_type: 'event_admin',
      }),
    ]);

    invalidateEventCache(newEvent.event_id);
    invalidateAuthContextCache(auth.email);

    if (notify_students) {
      void notifyStudentsByScope(supabase, normalizedLcds, {
        title: `📅 Sự kiện mới: ${cleanName}`,
        body: `Chương trình hỗ trợ do ${cleanOrg} tổ chức vừa mở trên hệ thống. Bấm để xem & đăng ký!`,
        url: `/events/${newEvent.event_id}/register`,
        tag: `event-new-${newEvent.event_id}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: 'Đã tạo & mở sự kiện hỗ trợ thành công (Không mượn phòng • Miễn duyệt CTSV)!',
      data: {
        ...newEvent,
        sessions: finalSessions,
        max_participants: maxParticipants,
        max_volunteers: maxVolunteers,
        is_recruitment_open: maxVolunteers > 0,
        require_registration: finalRequireReg,
        allowed_lcds: normalizedLcds,
        organization_unit: cleanOrg,
        description: cleanDesc,
        is_support_event: true,
      },
    });
  } catch (err: any) {
    console.error('POST /api/office/events error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi máy chủ khi tạo sự kiện hỗ trợ.' },
      { status: 500 }
    );
  }
}
