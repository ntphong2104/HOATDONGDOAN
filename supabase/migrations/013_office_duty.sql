-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 013: VĂN PHÒNG ĐOÀN — Role Admin VPĐ + Trực văn phòng
--
--  1. Mở rộng CHECK constraint officer_roles.role_tier (thêm 'security', 'office_admin')
--  2. Bảng CTV trực (office_duty_volunteers)
--  3. Bảng đợt mở đăng ký (office_duty_windows)
--  4. Bảng đăng ký ca trực (office_duty_registrations) — tối đa N người/ca (mặc định 2)
--  5. Bảng chấm công check-in/out (office_duty_attendance)
--  6. RLS: CTV chỉ thấy phần của mình; Admin VPĐ / Super Admin toàn quyền
--
-- Lưu ý: Idempotent — chạy lại nhiều lần an toàn trên Supabase SQL Editor.
-- Ghi chú bảo mật: Chấm công (attendance) CHỈ ghi qua API server (service role) vì
--   việc kiểm tra mạng (IP) VPĐ chỉ thực hiện được ở server.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Nếu bảng officer_roles tồn tại thì mở rộng CHECK constraint (an toàn nếu DB chỉ dùng system_settings)
DO $$
BEGIN
  IF to_regclass('public.officer_roles') IS NOT NULL THEN
    ALTER TABLE public.officer_roles DROP CONSTRAINT IF EXISTS chk_officer_role_tier;
    ALTER TABLE public.officer_roles
      ADD CONSTRAINT chk_officer_role_tier
      CHECK (role_tier IN ('super_admin', 'youth_union', 'ctsv', 'facility', 'security', 'event_admin', 'checker', 'office_admin'));
  END IF;
END $$;

-- 2. Hàm kiểm tra quyền (đọc từ is_super_admin + system_settings.officer_roles_registry)
CREATE OR REPLACE FUNCTION public.is_office_admin()
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
  IF (SELECT public.is_super_admin()) THEN RETURN TRUE; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings s,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(s.value) = 'array' THEN s.value ELSE '[]'::jsonb END
         ) AS elem
    WHERE s.key = 'officer_roles_registry'
      AND LOWER(COALESCE(elem->>'email', '')) = v_email
      AND COALESCE(elem->>'role_tier', '') IN ('office_admin', 'super_admin')
  ) INTO v_found;

  RETURN v_found;
END;
$$;

CREATE TABLE IF NOT EXISTS public.office_duty_volunteers (
    mssv        VARCHAR(20)     PRIMARY KEY,
    email       VARCHAR(120)    NOT NULL,
    full_name   VARCHAR(150),
    class_id    VARCHAR(40),
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    added_by    VARCHAR(120),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_office_duty_volunteers_email
  ON public.office_duty_volunteers (LOWER(email));

CREATE OR REPLACE FUNCTION public.is_office_duty_volunteer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.office_duty_volunteers
    WHERE LOWER(email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
      AND is_active = TRUE
  )
$$;

-- 3. Đợt mở đăng ký (do Admin VPĐ tạo)
CREATE TABLE IF NOT EXISTS public.office_duty_windows (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(150)    NOT NULL,
    apply_from  DATE            NOT NULL,
    apply_to    DATE            NOT NULL,
    open_at     TIMESTAMPTZ     NOT NULL,
    close_at    TIMESTAMPTZ     NOT NULL,
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    created_by  VARCHAR(120),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT chk_office_duty_window_dates CHECK (apply_from <= apply_to),
    CONSTRAINT chk_office_duty_window_open  CHECK (open_at < close_at)
);

-- 4. Đăng ký ca trực
CREATE TABLE IF NOT EXISTS public.office_duty_registrations (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    duty_date     DATE          NOT NULL,
    shift         VARCHAR(10)   NOT NULL,
    mssv          VARCHAR(20)   NOT NULL,
    email         VARCHAR(120)  NOT NULL,
    full_name     VARCHAR(150),
    registered_by VARCHAR(120),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_office_duty_shift CHECK (shift IN ('morning', 'afternoon')),
    CONSTRAINT uq_office_duty_slot_member UNIQUE (duty_date, shift, mssv)
);
CREATE INDEX IF NOT EXISTS idx_office_duty_reg_date ON public.office_duty_registrations (duty_date);
CREATE INDEX IF NOT EXISTS idx_office_duty_reg_email ON public.office_duty_registrations (LOWER(email));

-- Trigger: chỉ Thứ 2-6, tối đa N người/ca (đọc từ system_settings.office_duty_config, mặc định 2),
--          CTV tự đăng ký phải nằm trong một đợt mở đăng ký còn hiệu lực.
CREATE OR REPLACE FUNCTION public.enforce_office_duty_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max   INT := 2;
  v_count INT;
  v_cfg   JSONB;
  v_bypass BOOLEAN := FALSE;
BEGIN
  IF EXTRACT(ISODOW FROM NEW.duty_date) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'OFFICE_DUTY_NOT_WEEKDAY: Chỉ trực Thứ 2 đến Thứ 6';
  END IF;

  BEGIN
    SELECT value INTO v_cfg FROM public.system_settings WHERE key = 'office_duty_config';
    IF v_cfg IS NOT NULL AND (v_cfg->>'max_per_shift') ~ '^[0-9]+$' THEN
      v_max := GREATEST(1, (v_cfg->>'max_per_shift')::INT);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_max := 2;
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.office_duty_registrations
  WHERE duty_date = NEW.duty_date AND shift = NEW.shift;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'OFFICE_DUTY_SLOT_FULL: Ca này đã đủ % người', v_max;
  END IF;

  -- service_role (API đã kiểm tra) và Admin VPĐ được bỏ qua kiểm tra đợt đăng ký
  v_bypass := (COALESCE(auth.role(), '') = 'service_role') OR (SELECT public.is_office_admin());
  IF NOT v_bypass THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.office_duty_windows w
      WHERE w.is_active = TRUE
        AND now() BETWEEN w.open_at AND w.close_at
        AND NEW.duty_date BETWEEN w.apply_from AND w.apply_to
    ) THEN
      RAISE EXCEPTION 'OFFICE_DUTY_WINDOW_CLOSED: Hiện chưa mở đăng ký cho ngày này';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_office_duty_rules ON public.office_duty_registrations;
CREATE TRIGGER trg_office_duty_rules
  BEFORE INSERT ON public.office_duty_registrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_office_duty_rules();

-- 5. Chấm công check-in / check-out
CREATE TABLE IF NOT EXISTS public.office_duty_attendance (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id  UUID          NOT NULL UNIQUE REFERENCES public.office_duty_registrations(id) ON DELETE CASCADE,
    duty_date        DATE          NOT NULL,
    shift            VARCHAR(10)   NOT NULL,
    mssv             VARCHAR(20)   NOT NULL,
    email            VARCHAR(120)  NOT NULL,
    full_name        VARCHAR(150),
    check_in_at      TIMESTAMPTZ,
    check_in_ip      VARCHAR(64),
    check_out_at     TIMESTAMPTZ,
    check_out_ip     VARCHAR(64),
    late_minutes     INT           NOT NULL DEFAULT 0,
    worked_minutes   INT           NOT NULL DEFAULT 0,
    status           VARCHAR(20)   NOT NULL DEFAULT 'checked_in',
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_office_duty_att_shift CHECK (shift IN ('morning', 'afternoon'))
);
CREATE INDEX IF NOT EXISTS idx_office_duty_att_date ON public.office_duty_attendance (duty_date);
CREATE INDEX IF NOT EXISTS idx_office_duty_att_mssv ON public.office_duty_attendance (mssv);

-- 6. RLS
ALTER TABLE public.office_duty_volunteers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_duty_windows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_duty_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_duty_attendance    ENABLE ROW LEVEL SECURITY;

-- volunteers: Admin VPĐ toàn quyền; CTV chỉ đọc dòng của mình
DROP POLICY IF EXISTS "duty_vol_select" ON public.office_duty_volunteers;
CREATE POLICY "duty_vol_select" ON public.office_duty_volunteers FOR SELECT TO authenticated
USING (
  LOWER(email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
  OR (SELECT public.is_office_admin())
);
DROP POLICY IF EXISTS "duty_vol_write" ON public.office_duty_volunteers;
CREATE POLICY "duty_vol_write" ON public.office_duty_volunteers FOR ALL TO authenticated
USING ((SELECT public.is_office_admin()))
WITH CHECK ((SELECT public.is_office_admin()));

-- windows: CTV & Admin đọc; Admin ghi
DROP POLICY IF EXISTS "duty_win_select" ON public.office_duty_windows;
CREATE POLICY "duty_win_select" ON public.office_duty_windows FOR SELECT TO authenticated
USING ((SELECT public.is_office_duty_volunteer()) OR (SELECT public.is_office_admin()));
DROP POLICY IF EXISTS "duty_win_write" ON public.office_duty_windows;
CREATE POLICY "duty_win_write" ON public.office_duty_windows FOR ALL TO authenticated
USING ((SELECT public.is_office_admin()))
WITH CHECK ((SELECT public.is_office_admin()));

-- registrations: CTV & Admin đọc (để biết ca còn chỗ); CTV chỉ tự thêm/xoá dòng của mình
DROP POLICY IF EXISTS "duty_reg_select" ON public.office_duty_registrations;
CREATE POLICY "duty_reg_select" ON public.office_duty_registrations FOR SELECT TO authenticated
USING ((SELECT public.is_office_duty_volunteer()) OR (SELECT public.is_office_admin()));
DROP POLICY IF EXISTS "duty_reg_insert" ON public.office_duty_registrations;
CREATE POLICY "duty_reg_insert" ON public.office_duty_registrations FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_office_admin())
  OR (
    (SELECT public.is_office_duty_volunteer())
    AND LOWER(email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
  )
);
DROP POLICY IF EXISTS "duty_reg_delete" ON public.office_duty_registrations;
CREATE POLICY "duty_reg_delete" ON public.office_duty_registrations FOR DELETE TO authenticated
USING (
  (SELECT public.is_office_admin())
  OR LOWER(email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
);

-- attendance: đọc dòng của mình / Admin đọc tất cả; GHI chỉ qua service_role (API kiểm tra mạng VPĐ),
-- riêng Admin VPĐ được sửa/xoá chấm công.
DROP POLICY IF EXISTS "duty_att_select" ON public.office_duty_attendance;
CREATE POLICY "duty_att_select" ON public.office_duty_attendance FOR SELECT TO authenticated
USING (
  LOWER(email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
  OR (SELECT public.is_office_admin())
);
DROP POLICY IF EXISTS "duty_att_admin_write" ON public.office_duty_attendance;
CREATE POLICY "duty_att_admin_write" ON public.office_duty_attendance FOR ALL TO authenticated
USING ((SELECT public.is_office_admin()))
WITH CHECK ((SELECT public.is_office_admin()));
DROP POLICY IF EXISTS "duty_att_self_write" ON public.office_duty_attendance;
CREATE POLICY "duty_att_self_write" ON public.office_duty_attendance FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_office_duty_volunteer()) AND LOWER(email) = LOWER(COALESCE((SELECT public.current_user_email()), '')));
DROP POLICY IF EXISTS "duty_att_self_update" ON public.office_duty_attendance;
CREATE POLICY "duty_att_self_update" ON public.office_duty_attendance FOR UPDATE TO authenticated
USING ((SELECT public.is_office_duty_volunteer()) AND LOWER(email) = LOWER(COALESCE((SELECT public.current_user_email()), '')));
