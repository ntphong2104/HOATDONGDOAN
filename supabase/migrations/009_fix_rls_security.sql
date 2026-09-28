-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 009: Fix RLS Security — Enable RLS + Policies cho TẤT CẢ bảng
-- 
-- Giải quyết 10 lỗi CRITICAL từ Supabase Advisor:
--   "Policy Exists RLS Disabled" trên check_ins, class_delegates, event_roles, events
-- Và thêm RLS cho các bảng tạo trên Dashboard chưa có RLS.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────
-- PHẦN 1: BẬT RLS CHO CÁC BẢNG BỊ CẢNH BÁO
-- (Các bảng đã có policy nhưng RLS bị tắt trên production)
-- ───────────────────────────────────────

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins FORCE ROW LEVEL SECURITY;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.event_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins FORCE ROW LEVEL SECURITY;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;

-- ───────────────────────────────────────
-- PHẦN 2: BẬT RLS CHO CÁC BẢNG TẠO TRÊN DASHBOARD (THIẾU RLS HOÀN TOÀN)
-- ───────────────────────────────────────

-- 2a. event_registrations
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations FORCE ROW LEVEL SECURITY;

-- 2b. event_proposals
ALTER TABLE public.event_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_proposals FORCE ROW LEVEL SECURITY;

-- 2c. unit_ratings
ALTER TABLE public.unit_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_ratings FORCE ROW LEVEL SECURITY;

-- 2d. user_penalties
ALTER TABLE public.user_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_penalties FORCE ROW LEVEL SECURITY;

-- 2e. proposal_logs
ALTER TABLE public.proposal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_logs FORCE ROW LEVEL SECURITY;

-- 2f. class_delegates
ALTER TABLE public.class_delegates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_delegates FORCE ROW LEVEL SECURITY;

-- 2g. rooms
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;

-- 2h. session_checkins
ALTER TABLE public.session_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_checkins FORCE ROW LEVEL SECURITY;

-- ───────────────────────────────────────
-- PHẦN 3: FIX POLICIES QUÁ LỎNG
-- ───────────────────────────────────────

-- 3a. Fix checkins_select: Bỏ anon, giữ logic phân quyền chặt chẽ
DROP POLICY IF EXISTS "checkins_select" ON public.check_ins;
CREATE POLICY "checkins_select" ON public.check_ins
FOR SELECT TO authenticated
USING (
  mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

-- 3b. Fix checkins_insert: Bỏ anon + bỏ bypass qua checked_by string
DROP POLICY IF EXISTS "checkins_insert" ON public.check_ins;
CREATE POLICY "checkins_insert" ON public.check_ins
FOR INSERT TO authenticated
WITH CHECK (
  -- Quản trị viên sự kiện hoặc Checker
  (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
  OR (SELECT public.is_super_admin())
  -- Sinh viên tự điểm danh qua QR động (xác thực qua authenticated session)
  OR (mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email())))
);
-- Đã loại bỏ: OR (checked_by = 'Mã QR Động (Tự quét)') — bypass nguy hiểm!

-- ───────────────────────────────────────
-- PHẦN 4: TẠO POLICIES CHO CÁC BẢNG THIẾU
-- ───────────────────────────────────────

-- ─── EVENT_REGISTRATIONS ───
-- Sinh viên xem đăng ký của mình, admin/checker xem theo sự kiện
DROP POLICY IF EXISTS "registrations_select" ON public.event_registrations;
CREATE POLICY "registrations_select" ON public.event_registrations
FOR SELECT TO authenticated
USING (
  email = (SELECT public.current_user_email())
  OR mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

DROP POLICY IF EXISTS "registrations_insert" ON public.event_registrations;
CREATE POLICY "registrations_insert" ON public.event_registrations
FOR INSERT TO authenticated
WITH CHECK (
  -- Sinh viên tự đăng ký
  email = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin']))
);

DROP POLICY IF EXISTS "registrations_update" ON public.event_registrations;
CREATE POLICY "registrations_update" ON public.event_registrations
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin']))
);

DROP POLICY IF EXISTS "registrations_delete" ON public.event_registrations;
CREATE POLICY "registrations_delete" ON public.event_registrations
FOR DELETE TO authenticated
USING (
  -- Sinh viên tự hủy đăng ký
  email = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin']))
);

-- ─── EVENT_PROPOSALS ───
-- Người tạo xem đề xuất của mình, approvers xem tất cả
DROP POLICY IF EXISTS "proposals_select" ON public.event_proposals;
CREATE POLICY "proposals_select" ON public.event_proposals
FOR SELECT TO authenticated
USING (
  created_by = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
  OR EXISTS (
    SELECT 1 FROM public.officer_roles
    WHERE email = (SELECT public.current_user_email())
      AND role_tier IN ('super_admin', 'youth_union', 'ctsv', 'facility')
  )
);

DROP POLICY IF EXISTS "proposals_insert" ON public.event_proposals;
CREATE POLICY "proposals_insert" ON public.event_proposals
FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
);

DROP POLICY IF EXISTS "proposals_update" ON public.event_proposals;
CREATE POLICY "proposals_update" ON public.event_proposals
FOR UPDATE TO authenticated
USING (
  created_by = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
  OR EXISTS (
    SELECT 1 FROM public.officer_roles
    WHERE email = (SELECT public.current_user_email())
      AND role_tier IN ('super_admin', 'youth_union', 'ctsv', 'facility')
  )
);

-- ─── UNIT_RATINGS ───
-- Tất cả authenticated đọc (transparency), officers ghi
DROP POLICY IF EXISTS "ratings_select" ON public.unit_ratings;
CREATE POLICY "ratings_select" ON public.unit_ratings
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "ratings_insert" ON public.unit_ratings;
CREATE POLICY "ratings_insert" ON public.unit_ratings
FOR INSERT TO authenticated
WITH CHECK (
  rater_email = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
);

-- ─── USER_PENALTIES ───
-- Chỉ admin và sinh viên xem phạt của chính mình
DROP POLICY IF EXISTS "penalties_select" ON public.user_penalties;
CREATE POLICY "penalties_select" ON public.user_penalties
FOR SELECT TO authenticated
USING (
  mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
);

DROP POLICY IF EXISTS "penalties_insert" ON public.user_penalties;
CREATE POLICY "penalties_insert" ON public.user_penalties
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "penalties_update" ON public.user_penalties;
CREATE POLICY "penalties_update" ON public.user_penalties
FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "penalties_delete" ON public.user_penalties;
CREATE POLICY "penalties_delete" ON public.user_penalties
FOR DELETE TO authenticated
USING ((SELECT public.is_super_admin()));

-- ─── PROPOSAL_LOGS ───
-- Tất cả authenticated đọc (audit trail, transparency)
DROP POLICY IF EXISTS "logs_select" ON public.proposal_logs;
CREATE POLICY "logs_select" ON public.proposal_logs
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "logs_insert" ON public.proposal_logs;
CREATE POLICY "logs_insert" ON public.proposal_logs
FOR INSERT TO authenticated
WITH CHECK (
  actor_email = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
  OR EXISTS (
    SELECT 1 FROM public.officer_roles
    WHERE email = (SELECT public.current_user_email())
      AND role_tier IN ('super_admin', 'youth_union', 'ctsv', 'facility')
  )
);

-- ─── CLASS_DELEGATES ───
-- Authenticated đọc (tra cứu BCS lớp), chỉ admin quản lý
DROP POLICY IF EXISTS "delegates_select" ON public.class_delegates;
CREATE POLICY "delegates_select" ON public.class_delegates
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "delegates_insert" ON public.class_delegates;
CREATE POLICY "delegates_insert" ON public.class_delegates
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "delegates_update" ON public.class_delegates;
CREATE POLICY "delegates_update" ON public.class_delegates
FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "delegates_delete" ON public.class_delegates;
CREATE POLICY "delegates_delete" ON public.class_delegates
FOR DELETE TO authenticated
USING ((SELECT public.is_super_admin()));

-- ─── ROOMS ───
-- Tất cả authenticated đọc (chọn phòng khi tạo proposal), admin quản lý
DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
CREATE POLICY "rooms_select" ON public.rooms
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
CREATE POLICY "rooms_insert" ON public.rooms
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_super_admin())
  OR EXISTS (
    SELECT 1 FROM public.officer_roles
    WHERE email = (SELECT public.current_user_email())
      AND role_tier IN ('super_admin', 'facility')
  )
);

DROP POLICY IF EXISTS "rooms_update" ON public.rooms;
CREATE POLICY "rooms_update" ON public.rooms
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR EXISTS (
    SELECT 1 FROM public.officer_roles
    WHERE email = (SELECT public.current_user_email())
      AND role_tier IN ('super_admin', 'facility')
  )
);

DROP POLICY IF EXISTS "rooms_delete" ON public.rooms;
CREATE POLICY "rooms_delete" ON public.rooms
FOR DELETE TO authenticated
USING ((SELECT public.is_super_admin()));

-- ─── SESSION_CHECKINS ───
-- Sinh viên xem của mình, admin/checker xem theo sự kiện
DROP POLICY IF EXISTS "session_checkins_select" ON public.session_checkins;
CREATE POLICY "session_checkins_select" ON public.session_checkins
FOR SELECT TO authenticated
USING (
  mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

-- Insert qua RPC checkin_atomic() — nhưng cần policy cho trường hợp direct insert
DROP POLICY IF EXISTS "session_checkins_insert" ON public.session_checkins;
CREATE POLICY "session_checkins_insert" ON public.session_checkins
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
  OR (SELECT public.is_super_admin())
  OR (mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email())))
);

-- ─── OFFICER_ROLES (có RLS nhưng THIẾU POLICY) ───
DROP POLICY IF EXISTS "officer_roles_select" ON public.officer_roles;
CREATE POLICY "officer_roles_select" ON public.officer_roles
FOR SELECT TO authenticated
USING (
  email = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
);

DROP POLICY IF EXISTS "officer_roles_insert" ON public.officer_roles;
CREATE POLICY "officer_roles_insert" ON public.officer_roles
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "officer_roles_update" ON public.officer_roles;
CREATE POLICY "officer_roles_update" ON public.officer_roles
FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "officer_roles_delete" ON public.officer_roles;
CREATE POLICY "officer_roles_delete" ON public.officer_roles
FOR DELETE TO authenticated
USING ((SELECT public.is_super_admin()));

-- ───────────────────────────────────────
-- PHẦN 5: THU HỒI GRANT CHO ANON TRÊN SESSION_CHECKINS
-- (Migration 20260924 đã GRANT cho anon — rất nguy hiểm)
-- ───────────────────────────────────────

REVOKE INSERT ON public.session_checkins FROM anon;
-- Giữ SELECT cho anon nếu cần, nhưng RLS sẽ block
-- REVOKE SELECT ON public.session_checkins FROM anon;

-- ═══════════════════════════════════════════════════════════════════
-- GHI CHÚ: 
-- Một số API routes dùng createAdminClient() (service_role key) sẽ bypass RLS.
-- Đây là expected behavior cho admin operations.
-- Các API routes dùng createClient() (anon key) sẽ bị RLS filter đúng cách.
-- ═══════════════════════════════════════════════════════════════════
