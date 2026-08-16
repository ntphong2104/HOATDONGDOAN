-- ════════════════════════════════════════════
-- MIGRATION 004: Officer Roles & Multi-Account Permissions
-- Phân quyền cán bộ đa tài khoản cho Đoàn trường & Phòng ban
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.officer_roles (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       VARCHAR(100)    NOT NULL,
    role_tier   VARCHAR(30)     NOT NULL, -- 'super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin'
    unit_code   VARCHAR(50)     NOT NULL DEFAULT 'BCH_DOAN',
    unit_name   VARCHAR(150)    NOT NULL DEFAULT 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
    full_name   VARCHAR(150),
    notes       TEXT,
    created_by  VARCHAR(100)    NOT NULL DEFAULT 'Super Admin',
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT uq_officer_roles_email_role_unit UNIQUE (email, role_tier, unit_code),
    CONSTRAINT chk_officer_role_tier CHECK (role_tier IN ('super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin'))
);

CREATE INDEX IF NOT EXISTS idx_officer_roles_email ON public.officer_roles(email);
CREATE INDEX IF NOT EXISTS idx_officer_roles_tier ON public.officer_roles(role_tier);

-- Bật RLS
ALTER TABLE public.officer_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_roles FORCE ROW LEVEL SECURITY;

-- Seed tài khoản Super Admin ban đầu
INSERT INTO public.officer_roles (email, role_tier, unit_code, unit_name, full_name, notes, created_by)
VALUES 
('n22dccn158@student.ptithcm.edu.vn', 'super_admin', 'BCH_DOAN', 'Ban Quản Trị Hệ Thống', 'Nguyễn Thanh Phong', 'Super Admin Gốc (Root Admin)', 'System'),
('doanthanhnien@ptithcm.edu.vn', 'youth_union', 'BCH_DOAN', 'Đoàn TNCS Học Viện Cơ Sở TP.HCM', 'Đoàn Học Viện', 'Tài khoản chức năng Đoàn Học Viện', 'System'),
('ctsv@ptithcm.edu.vn', 'ctsv', 'PHONG_CTSV', 'Phòng Công Tác Sinh Viên (CTSV)', 'Phòng CTSV', 'Tài khoản chức năng Phòng CTSV', 'System'),
('quantri@ptithcm.edu.vn', 'facility', 'PHONG_CSVC', 'Phòng Quản Trị CSVC & Tổ Chức', 'Phòng CSVC', 'Tài khoản chức năng Phòng CSVC', 'System')
ON CONFLICT (email, role_tier, unit_code) DO NOTHING;

COMMENT ON TABLE public.officer_roles IS 'Danh sách cán bộ và phân quyền đa tài khoản các cấp.';
