-- ════════════════════════════════════════════
-- MIGRATION 005: Cập nhật RLS Policy cho phép sinh viên tự điểm danh qua QR động
-- ════════════════════════════════════════════

-- 1. Xóa policy cũ chỉ cho phép Event Admin/Checker điểm danh
DROP POLICY IF EXISTS "checkins_insert" ON public.check_ins;

-- 2. Tạo policy mới cho phép:
--    a) Cán bộ / Checker điểm danh sinh viên
--    b) Super Admin điểm danh
--    c) Sinh viên tự điểm danh qua QR động hợp lệ (được ghi nhận bởi API Server)
CREATE POLICY "checkins_insert" ON public.check_ins FOR INSERT TO authenticated, anon
    WITH CHECK (
        -- Quản trị viên sự kiện hoặc Checker
        (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
        OR (SELECT public.is_super_admin())
        -- Sinh viên tự điểm danh qua ứng dụng
        OR (mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email())))
        OR (mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (auth.jwt() -> 'user_metadata' ->> 'email')))
        OR (mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (auth.jwt() ->> 'email')))
        OR (checked_by = 'Mã QR Động (Tự quét)')
    );
