-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 012: RLS Policies cho 8 Liên Chi Đoàn (LCĐ) & Đoàn Học Viện
--
-- Mục đích:
--   Cho phép các tài khoản Liên Chi Đoàn (8 LCĐ chính thức & cán bộ LCĐ trong
--   officer_roles) và Đoàn Học Viện (youth_union):
--     1. Đọc danh sách sinh viên (users) để hiển thị trang Quản lý Đoàn viên theo LCĐ
--     2. Đọc lịch sử điểm danh / minh chứng ĐRL (check_ins, event_registrations,
--        session_checkins, user_penalties) trên toàn Học viện để kiểm tra ĐRL
--        cho đoàn viên thuộc LCĐ mình (API vẫn lọc chặt theo phạm vi LCĐ)
--     3. Thêm / gia hạn / thu hồi BCH Chi đoàn (class_delegates) theo nhiệm kỳ
--        (API /api/admin/delegates kiểm tra chặt quyền sở hữu từng LCĐ)
--
-- Lưu ý: Idempotent — có thể chạy lại nhiều lần an toàn trên Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_lcd_or_youth_union_officer()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := LOWER(COALESCE((SELECT public.current_user_email()), ''));
  v_found BOOLEAN := FALSE;
BEGIN
  IF v_email = '' THEN RETURN FALSE; END IF;
  IF v_email IN (
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

  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings s,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(s.value) = 'array' THEN s.value ELSE '[]'::jsonb END
         ) AS elem
    WHERE s.key = 'officer_roles_registry'
      AND LOWER(COALESCE(elem->>'email', '')) = v_email
      AND (
        COALESCE(elem->>'role_tier', '') IN ('super_admin', 'youth_union')
        OR UPPER(COALESCE(elem->>'unit_code', '')) LIKE 'LCD_%'
      )
  ) INTO v_found;

  RETURN v_found;
END;
$$;

-- 1. USERS: Cho phép LCĐ & Đoàn trường đọc danh sách đoàn viên
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
FOR SELECT TO authenticated
USING (
  email = (SELECT public.current_user_email())
  OR (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
);

-- 2. CHECK_INS: Cho phép LCĐ & Đoàn trường xem lượt điểm danh ĐRL của đoàn viên
DROP POLICY IF EXISTS "checkins_select" ON public.check_ins;
CREATE POLICY "checkins_select" ON public.check_ins
FOR SELECT TO authenticated
USING (
  mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

-- 3. EVENT_REGISTRATIONS: Cho phép LCĐ & Đoàn trường đọc trạng thái tham gia
DROP POLICY IF EXISTS "registrations_select" ON public.event_registrations;
CREATE POLICY "registrations_select" ON public.event_registrations
FOR SELECT TO authenticated
USING (
  email = (SELECT public.current_user_email())
  OR mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

-- 4. SESSION_CHECKINS: Cho phép LCĐ & Đoàn trường xem chi tiết buổi điểm danh
DROP POLICY IF EXISTS "session_checkins_select" ON public.session_checkins;
CREATE POLICY "session_checkins_select" ON public.session_checkins
FOR SELECT TO authenticated
USING (
  mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
  OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
);

-- 5. USER_PENALTIES: Cho phép LCĐ & Đoàn trường xem cảnh báo vắng của đoàn viên
DROP POLICY IF EXISTS "penalties_select" ON public.user_penalties;
CREATE POLICY "penalties_select" ON public.user_penalties
FOR SELECT TO authenticated
USING (
  mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
  OR (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
);

-- 6. CLASS_DELEGATES: Cho phép LCĐ & Đoàn trường cấp / gia hạn / thu hồi BCH Chi đoàn
DROP POLICY IF EXISTS "delegates_insert" ON public.class_delegates;
CREATE POLICY "delegates_insert" ON public.class_delegates
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
);

DROP POLICY IF EXISTS "delegates_update" ON public.class_delegates;
CREATE POLICY "delegates_update" ON public.class_delegates
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
);

DROP POLICY IF EXISTS "delegates_delete" ON public.class_delegates;
CREATE POLICY "delegates_delete" ON public.class_delegates
FOR DELETE TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR (SELECT public.is_lcd_or_youth_union_officer())
);

-- 7. SYSTEM_SETTINGS: Cho phép Super Admin thêm mới & cập nhật cấu hình học kỳ / hệ thống
DROP POLICY IF EXISTS "settings_insert_admin" ON public.system_settings;
CREATE POLICY "settings_insert_admin" ON public.system_settings
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "settings_update_admin" ON public.system_settings;
CREATE POLICY "settings_update_admin" ON public.system_settings
FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()));

-- 8. BẢNG XẾP HẠNG TOÀN TRƯỜNG: Hàm SECURITY DEFINER trả về cặp (event_id, mssv)
--    để sinh viên bình thường xem được Bảng Xếp Hạng toàn trường (8 LCĐ & Top SV)
--    mà KHÔNG cần mở quyền đọc trực tiếp bảng check_ins cá nhân của người khác.
CREATE OR REPLACE FUNCTION public.get_ranking_checkins_for_events(p_event_ids UUID[])
RETURNS TABLE (event_id UUID, mssv TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT c.event_id, UPPER(TRIM(c.mssv))::TEXT AS mssv
  FROM public.check_ins c
  WHERE c.event_id = ANY(p_event_ids)
    AND c.mssv IS NOT NULL
    AND TRIM(c.mssv) <> ''
  ORDER BY 1, 2
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_checkins_for_events(UUID[]) TO authenticated;
