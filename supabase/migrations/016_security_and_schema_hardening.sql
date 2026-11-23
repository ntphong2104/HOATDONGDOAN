-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 016: Security, RLS & Schema Hardening (Idempotent)
--
-- Khắc phục triệt để các lỗ hổng phát hiện khi kiểm toán toàn hệ thống:
--   1. Sửa public.current_user_email(): đọc từ verified top-level JWT claim
--      (auth.jwt() ->> 'email') thay vì user_metadata (vốn user tự sửa được!).
--   2. Khóa chặt public.system_settings: tách key công khai và key chứa PII
--      (user_profile_*, event_regs_*, officer_roles_registry, office_duty_config).
--   3. Chặn sinh viên tự INSERT check_ins / session_checkins / gọi RPC checkin_atomic
--      trực tiếp từ trình duyệt (bắt buộc qua API server kiểm tra QR động).
--   4. Chặn CTV tự INSERT/UPDATE office_duty_attendance trực tiếp (chỉ qua API
--      server kiểm tra IP Wi-Fi Văn phòng Đoàn).
--   5. Chặn người tạo đề xuất tự UPDATE status='approved' trên event_proposals;
--      hạn chế proposal_logs SELECT & thêm ratings_update / proposals_delete.
--   6. Sửa fn_restrict_email_domain() hỗ trợ đúng 4 domain PTIT / PTIT HCM.
--   7. Đồng bộ is_super_admin(), is_lcd_or_youth_union_officer(), is_office_admin()
--      với cả bảng officer_roles lẫn system_settings + so sánh LOWER(email).
--   8. Bổ sung index events(LOWER(created_by)) và unique indexes cho upsert.
--
-- An toàn khi chạy nhiều lần trên Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. CORE IDENTITY & ROLE HELPER FUNCTIONS ───

-- SECURITY CRITICAL: Never read user_metadata (user-editable via auth.updateUser).
-- Always read the verified top-level JWT email claim.
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := (SELECT public.current_user_email());
  v_found BOOLEAN := FALSE;
BEGIN
  IF v_email = '' THEN RETURN FALSE; END IF;
  IF v_email = 'n22dccn158@student.ptithcm.edu.vn' THEN RETURN TRUE; END IF;

  IF EXISTS (
    SELECT 1 FROM public.super_admins sa
    WHERE LOWER(sa.email) = v_email
  ) THEN
    RETURN TRUE;
  END IF;

  IF to_regclass('public.officer_roles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.officer_roles r
      WHERE LOWER(r.email) = v_email
        AND r.role_tier = 'super_admin'
    ) INTO v_found;
    IF v_found THEN RETURN TRUE; END IF;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_event_role(
  p_event_id UUID,
  p_role_types TEXT[] DEFAULT ARRAY['event_admin', 'checker']
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_roles er
    WHERE er.event_id = p_event_id
      AND LOWER(er.email) = (SELECT public.current_user_email())
      AND er.role_type = ANY(p_role_types)
  )
$$;

-- Helper to safely unwrap double-encoded JSONB strings (legacy `JSON.stringify` writes)
CREATE OR REPLACE FUNCTION public.unwrap_jsonb_setting(p_val JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text TEXT;
BEGIN
  IF p_val IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_val) = 'string' THEN
    v_text := TRIM(p_val #>> '{}');
    IF LEFT(v_text, 1) IN ('{', '[') OR v_text IN ('true', 'false') THEN
      BEGIN
        RETURN v_text::jsonb;
      EXCEPTION WHEN OTHERS THEN
        RETURN p_val;
      END;
    END IF;
  END IF;
  RETURN p_val;
END;
$$;

-- One-time idempotent unwrap of legacy double-encoded JSONB string rows in system_settings
DO $$
BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    UPDATE public.system_settings
    SET value = public.unwrap_jsonb_setting(value)
    WHERE jsonb_typeof(value) = 'string'
      AND key IN ('office_duty_config', 'officer_roles_registry', 'maintenance_mode');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_lcd_or_youth_union_officer()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := (SELECT public.current_user_email());
  v_found BOOLEAN := FALSE;
  v_val   JSONB;
  v_json  JSONB;
BEGIN
  IF v_email = '' THEN RETURN FALSE; END IF;

  IF v_email IN (
    'bchdoan@ptithcm.edu.vn',
    'lcdcntt@student.ptithcm.edu.vn',
    'lcdcndpt@student.ptithcm.edu.vn',
    'lcdattt@student.ptithcm.edu.vn',
    'lcdvt@student.ptithcm.edu.vn',
    'lcddt@student.ptithcm.edu.vn',
    'lcdqtkd@student.ptithcm.edu.vn',
    'lcdmarketing@student.ptithcm.edu.vn',
    'lcdketoan@student.ptithcm.edu.vn'
  ) THEN
    RETURN TRUE;
  END IF;

  IF to_regclass('public.officer_roles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.officer_roles r
      WHERE LOWER(r.email) = v_email
        AND (
          r.role_tier IN ('super_admin', 'youth_union')
          OR UPPER(COALESCE(r.unit_code, '')) LIKE 'LCD\_%' ESCAPE '\'
        )
    ) INTO v_found;
    IF v_found THEN RETURN TRUE; END IF;
  END IF;

  BEGIN
    SELECT s.value INTO v_val
    FROM public.system_settings s
    WHERE s.key = 'officer_roles_registry'
    LIMIT 1;

    v_json := public.unwrap_jsonb_setting(v_val);
    IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_json) AS elem
        WHERE LOWER(COALESCE(elem->>'email', '')) = v_email
          AND (
            COALESCE(elem->>'role_tier', '') IN ('super_admin', 'youth_union')
            OR COALESCE(elem->>'tier', '') IN ('super_admin', 'youth_union')
            OR UPPER(COALESCE(elem->>'unit_code', '')) LIKE 'LCD\_%' ESCAPE '\'
          )
      ) INTO v_found;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_found := FALSE;
  END;

  RETURN v_found;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_office_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := (SELECT public.current_user_email());
  v_val   JSONB;
  v_json  JSONB;
  v_found BOOLEAN := FALSE;
BEGIN
  IF v_email = '' THEN RETURN FALSE; END IF;
  IF (SELECT public.is_super_admin()) THEN RETURN TRUE; END IF;

  IF to_regclass('public.officer_roles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.officer_roles r
      WHERE LOWER(r.email) = v_email
        AND r.role_tier IN ('office_admin', 'super_admin')
    ) INTO v_found;
    IF v_found THEN RETURN TRUE; END IF;
  END IF;

  SELECT s.value INTO v_val
  FROM public.system_settings s
  WHERE s.key = 'officer_roles_registry'
  LIMIT 1;

  v_json := public.unwrap_jsonb_setting(v_val);
  IF v_json IS NULL OR jsonb_typeof(v_json) <> 'array' THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_json) AS elem
    WHERE LOWER(COALESCE(elem->>'email', '')) = v_email
      AND COALESCE(elem->>'role_tier', '') IN ('office_admin', 'super_admin')
  ) INTO v_found;

  RETURN v_found;
END;
$$;

-- Helper for proposal approver tiers (idempotent when officer_roles table is absent + checks system_settings fallback)
CREATE OR REPLACE FUNCTION public.is_proposal_approver()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := (SELECT public.current_user_email());
  v_val   JSONB;
  v_json  JSONB;
  v_found BOOLEAN := FALSE;
BEGIN
  IF v_email = '' THEN RETURN FALSE; END IF;
  IF (SELECT public.is_super_admin()) THEN RETURN TRUE; END IF;

  IF v_email IN (
    'bchdoan@ptithcm.edu.vn',
    'ctsv@ptithcm.edu.vn',
    'phongctsv@ptithcm.edu.vn',
    'quantri@ptithcm.edu.vn',
    'phongquantri@ptithcm.edu.vn'
  ) THEN
    RETURN TRUE;
  END IF;

  IF to_regclass('public.officer_roles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.officer_roles r
      WHERE LOWER(r.email) = v_email
        AND r.role_tier IN ('super_admin', 'youth_union', 'ctsv', 'facility')
    ) INTO v_found;
    IF v_found THEN RETURN TRUE; END IF;
  END IF;

  BEGIN
    SELECT s.value INTO v_val
    FROM public.system_settings s
    WHERE s.key = 'officer_roles_registry'
    LIMIT 1;

    v_json := public.unwrap_jsonb_setting(v_val);
    IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_json) AS elem
        WHERE LOWER(COALESCE(elem->>'email', '')) = v_email
          AND (
            COALESCE(elem->>'role_tier', '') IN ('super_admin', 'youth_union', 'ctsv', 'facility')
            OR COALESCE(elem->>'tier', '') IN ('super_admin', 'youth_union', 'ctsv', 'facility')
          )
      ) INTO v_found;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_found := FALSE;
  END;

  RETURN v_found;
END;
$$;

-- Restrict helper execution from anon/PUBLIC where unnecessary (guarded for idempotency)
DO $$
BEGIN
  IF to_regprocedure('public.get_ranking_checkins_for_events(uuid[])') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_ranking_checkins_for_events(UUID[]) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_ranking_checkins_for_events(UUID[]) TO authenticated, service_role;
  END IF;
END $$;

-- ─── 2. HARDEN SYSTEM_SETTINGS (BLOCK PII LEAK) ───

DROP POLICY IF EXISTS "settings_select_all" ON public.system_settings;
DROP POLICY IF EXISTS "settings_select_public" ON public.system_settings;
DROP POLICY IF EXISTS "settings_select_restricted" ON public.system_settings;
DROP POLICY IF EXISTS "settings_insert_admin" ON public.system_settings;
DROP POLICY IF EXISTS "settings_insert_own_or_admin" ON public.system_settings;
DROP POLICY IF EXISTS "settings_update_admin" ON public.system_settings;

-- Public configuration & non-PII event/proposal metadata readable for landing & public event pages
CREATE POLICY "settings_select_public" ON public.system_settings
FOR SELECT TO anon, authenticated
USING (
  key IN ('maintenance_mode', 'academic_semesters', 'graduated_cohorts_config')
  OR key LIKE 'event\_meta\_%' ESCAPE '\'
  OR key LIKE 'proposal\_meta\_%' ESCAPE '\'
);

-- Sensitive keys (user_profile_* phones, event_regs_*, officer_roles_registry, office_duty_config)
-- are strictly restricted to owner or authorized staff
CREATE POLICY "settings_select_restricted" ON public.system_settings
FOR SELECT TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR key = ('user_profile_' || (SELECT public.current_user_email()))
  OR (key = 'officer_roles_registry' AND (SELECT public.is_lcd_or_youth_union_officer()))
  OR (
    key LIKE 'event\_regs\_%' ESCAPE '\'
    AND EXISTS (
      SELECT 1 FROM public.event_roles er
      WHERE ('event_regs_' || er.event_id::text) = public.system_settings.key
        AND LOWER(er.email) = (SELECT public.current_user_email())
    )
  )
);

CREATE POLICY "settings_insert_own_or_admin" ON public.system_settings
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_super_admin())
  OR key = ('user_profile_' || (SELECT public.current_user_email()))
);

CREATE POLICY "settings_update_admin" ON public.system_settings
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR key = ('user_profile_' || (SELECT public.current_user_email()))
)
WITH CHECK (
  (SELECT public.is_super_admin())
  OR key = ('user_profile_' || (SELECT public.current_user_email()))
);

-- ─── 3. HARDEN CHECK_INS, SESSION_CHECKINS & CHECKIN_ATOMIC RPC ───
-- Self check-in MUST go through /api/checkin/self (Dynamic QR HMAC + session validation + service_role).

DROP POLICY IF EXISTS "checkins_insert" ON public.check_ins;
CREATE POLICY "checkins_insert" ON public.check_ins
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

DROP POLICY IF EXISTS "session_checkins_insert" ON public.session_checkins;
CREATE POLICY "session_checkins_insert" ON public.session_checkins
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_super_admin())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'checkin_atomic'
  ) THEN
    REVOKE ALL ON FUNCTION public.checkin_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.checkin_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;
  END IF;
END $$;

-- ─── 4. HARDEN OFFICE_DUTY_ATTENDANCE (REMOVE CLIENT SELF-WRITE BYPASS) ───

DO $$
BEGIN
  IF to_regclass('public.office_duty_attendance') IS NOT NULL THEN
    DROP POLICY IF EXISTS "duty_att_self_write" ON public.office_duty_attendance;
    DROP POLICY IF EXISTS "duty_att_self_update" ON public.office_duty_attendance;
  END IF;
END $$;

-- ─── 5. HARDEN EVENT_PROPOSALS, PROPOSAL_LOGS & UNIT_RATINGS ───

DO $$
BEGIN
  IF to_regclass('public.event_proposals') IS NOT NULL THEN
    DROP POLICY IF EXISTS "proposals_select" ON public.event_proposals;
    CREATE POLICY "proposals_select" ON public.event_proposals
    FOR SELECT TO authenticated
    USING (
      LOWER(created_by) = (SELECT public.current_user_email())
      OR (SELECT public.is_proposal_approver())
    );

    -- Creators may only edit pending proposals and CANNOT change status/current_stage out of pending/youth_union
    DROP POLICY IF EXISTS "proposals_update" ON public.event_proposals;
    DROP POLICY IF EXISTS "proposals_update_creator" ON public.event_proposals;
    DROP POLICY IF EXISTS "proposals_update_approver" ON public.event_proposals;

    CREATE POLICY "proposals_update_creator" ON public.event_proposals
    FOR UPDATE TO authenticated
    USING (
      LOWER(created_by) = (SELECT public.current_user_email())
      AND status = 'pending'
    )
    WITH CHECK (
      LOWER(created_by) = (SELECT public.current_user_email())
      AND status = 'pending'
      AND current_stage IN ('youth_union', 'facility')
    );

    CREATE POLICY "proposals_update_approver" ON public.event_proposals
    FOR UPDATE TO authenticated
    USING ((SELECT public.is_proposal_approver()))
    WITH CHECK ((SELECT public.is_proposal_approver()));

    DROP POLICY IF EXISTS "proposals_delete" ON public.event_proposals;
    CREATE POLICY "proposals_delete" ON public.event_proposals
    FOR DELETE TO authenticated
    USING (
      (SELECT public.is_super_admin())
      OR (
        LOWER(created_by) = (SELECT public.current_user_email())
        AND status IN ('pending', 'rejected')
      )
    );
  END IF;

  IF to_regclass('public.proposal_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "logs_select" ON public.proposal_logs;
    CREATE POLICY "logs_select" ON public.proposal_logs
    FOR SELECT TO authenticated
    USING (
      (SELECT public.is_super_admin())
      OR (SELECT public.is_proposal_approver())
      OR EXISTS (
        SELECT 1 FROM public.event_proposals ep
        WHERE ep.id = public.proposal_logs.proposal_id
          AND LOWER(ep.created_by) = (SELECT public.current_user_email())
      )
    );
  END IF;

  IF to_regclass('public.unit_ratings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ratings_update" ON public.unit_ratings;
    CREATE POLICY "ratings_update" ON public.unit_ratings
    FOR UPDATE TO authenticated
    USING (
      LOWER(rater_email) = (SELECT public.current_user_email())
      OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
      LOWER(rater_email) = (SELECT public.current_user_email())
      OR (SELECT public.is_super_admin())
    );
  END IF;
END $$;

-- ─── 5B. HARDEN PUSH_SUBSCRIPTIONS (BLOCK DIRECT POSTGREST SSRF ENDPOINTS) ───
DO $$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    -- Force all push subscription writes through /api/push/subscribe (which enforces trusted HTTPS push host allowlist)
    DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subs_update_own" ON public.push_subscriptions;
  END IF;
END $$;

-- ─── 6. FIX AUTH HOOK EMAIL DOMAIN CHECK ───

CREATE OR REPLACE FUNCTION public.fn_restrict_email_domain(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_email TEXT;
BEGIN
  user_email := LOWER(TRIM(COALESCE(event -> 'record' ->> 'email', '')));

  IF user_email = '' OR NOT (
    user_email LIKE '%@student.ptithcm.edu.vn'
    OR user_email LIKE '%@ptithcm.edu.vn'
    OR user_email LIKE '%@ptit.edu.vn'
    OR user_email LIKE '%@stu.ptit.edu.vn'
  ) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Chỉ chấp nhận email Học viện (@student.ptithcm.edu.vn hoặc @ptithcm.edu.vn)'
      )
    );
  END IF;

  RETURN jsonb_build_object();
END;
$$;

-- ─── 7. MISSING INDEXES & UNIQUE CONSTRAINTS FOR UPSERTS ───

CREATE INDEX IF NOT EXISTS idx_events_created_by_lower
  ON public.events (LOWER(created_by));

DO $$
BEGIN
  IF to_regclass('public.unit_ratings') IS NOT NULL THEN
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_ratings_event_rater_tier
        ON public.unit_ratings (event_id, rater_tier);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Skipped unique index idx_unit_ratings_event_rater_tier due to existing duplicate rows';
    END;
  END IF;

  IF to_regclass('public.user_penalties') IS NOT NULL THEN
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_penalties_mssv_unique
        ON public.user_penalties (mssv);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Skipped unique index idx_user_penalties_mssv_unique due to existing duplicate rows';
    END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
