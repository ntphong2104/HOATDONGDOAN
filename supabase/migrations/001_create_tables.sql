-- ════════════════════════════════════════════
-- MIGRATION 001: Create All Tables
-- Nền Tảng Minh Chứng & Check-in Sự Kiện
-- ════════════════════════════════════════════

-- Bảng 1: Users (Danh bạ toàn trường)
CREATE TABLE IF NOT EXISTS public.users (
    mssv        VARCHAR(20)     PRIMARY KEY,
    email       VARCHAR(100)    NOT NULL,
    full_name   VARCHAR(100)    NOT NULL,
    class_id    VARCHAR(20)     NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email)
);

-- Bảng 2: Events (Sự kiện)
CREATE TABLE IF NOT EXISTS public.events (
    event_id    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name  VARCHAR(200)    NOT NULL,
    semester    VARCHAR(20)     NOT NULL,
    status      VARCHAR(10)     NOT NULL DEFAULT 'active',
    created_by  VARCHAR(100)    NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT chk_events_status CHECK (status IN ('active', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status) WHERE status = 'active';

-- Bảng 3: Event_Roles (Phân quyền theo sự kiện)
CREATE TABLE IF NOT EXISTS public.event_roles (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id    UUID            NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    email       VARCHAR(100)    NOT NULL,
    role_type   VARCHAR(20)     NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT uq_event_roles_event_email UNIQUE (event_id, email),
    CONSTRAINT chk_event_roles_type CHECK (role_type IN ('event_admin', 'checker'))
);

CREATE INDEX IF NOT EXISTS idx_event_roles_email ON public.event_roles (email);

-- Bảng 4: Check_ins (Minh chứng lõi)
CREATE TABLE IF NOT EXISTS public.check_ins (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mssv                VARCHAR(20)     NOT NULL REFERENCES public.users(mssv),
    event_id            UUID            NOT NULL REFERENCES public.events(event_id),
    participate_role    VARCHAR(20)     NOT NULL,
    checked_by          VARCHAR(100)    NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT uq_checkin_once UNIQUE (mssv, event_id),
    CONSTRAINT chk_checkin_role CHECK (participate_role IN ('participant', 'volunteer', 'organizer'))
);

CREATE INDEX IF NOT EXISTS idx_checkins_mssv ON public.check_ins(mssv);
CREATE INDEX IF NOT EXISTS idx_checkins_event_id ON public.check_ins(event_id);

-- Bảng 5: Super Admins
CREATE TABLE IF NOT EXISTS public.super_admins (
    email       VARCHAR(100)    PRIMARY KEY,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Bảng 6: System Settings
CREATE TABLE IF NOT EXISTS public.system_settings (
    key         VARCHAR(50)     PRIMARY KEY,
    value       JSONB           NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_by  VARCHAR(100)
);

-- Seed default maintenance mode
INSERT INTO public.system_settings (key, value)
VALUES ('maintenance_mode', '{"enabled": false, "message": "Hệ thống đang chốt điểm rèn luyện. Vui lòng quay lại sau."}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Comments
COMMENT ON TABLE public.users IS 'Danh bạ sinh viên toàn trường. Nạp bằng Excel.';
COMMENT ON TABLE public.events IS 'Danh sách sự kiện. Super Admin tạo/đóng.';
COMMENT ON TABLE public.event_roles IS 'Phân quyền tạm thời theo sự kiện.';
COMMENT ON TABLE public.check_ins IS 'Minh chứng check-in. 1 row = 1 lượt hợp lệ.';
COMMENT ON TABLE public.super_admins IS 'Danh sách Super Admin cố định.';
COMMENT ON TABLE public.system_settings IS 'Cấu hình hệ thống (maintenance mode).';
