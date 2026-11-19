-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 011: Mở rộng system_settings.key & bổ sung functional indexes
-- ═══════════════════════════════════════════════════════════════════

-- 1. Mở rộng cột key của system_settings từ VARCHAR(50) sang TEXT
--    (tránh lỗi cắt/từ chối các key dài > 50 ký tự như user_profile_<email> hoặc event_session_checkins_<uuid>)
ALTER TABLE public.system_settings
  ALTER COLUMN key TYPE TEXT;

-- 2. Bổ sung functional B-tree indexes cho truy vấn không phân biệt hoa/thường
CREATE INDEX IF NOT EXISTS idx_users_lower_email
  ON public.users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_users_upper_mssv
  ON public.users (UPPER(mssv));

CREATE INDEX IF NOT EXISTS idx_event_roles_lower_email
  ON public.event_roles (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_event_registrations_lower_email
  ON public.event_registrations (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_event_registrations_upper_mssv
  ON public.event_registrations (UPPER(mssv));

CREATE INDEX IF NOT EXISTS idx_checkins_upper_mssv
  ON public.check_ins (UPPER(mssv));

CREATE INDEX IF NOT EXISTS idx_session_checkins_upper_mssv
  ON public.session_checkins (UPPER(mssv));
