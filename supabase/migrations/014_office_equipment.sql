-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 014: VĂN PHÒNG ĐOÀN — Mượn dụng cụ & Tự động cấm mượn khi trễ hạn
--
--  1. office_items: Danh mục vật phẩm / dụng cụ tại Văn phòng Đoàn
--  2. office_borrow_requests: Đơn mượn dụng cụ do LCĐ / CLB tạo
--  3. office_borrow_items: Chi tiết vật phẩm & số lượng trong mỗi đơn
--  4. office_borrow_bans: Danh sách đơn vị bị cấm mượn (tự động khi trả trễ >= 1 ngày)
--  5. RLS: Đơn vị chỉ xem/tạo đơn của mình; Admin VPĐ / Super Admin toàn quyền
--
-- Lưu ý: Idempotent — chạy lại nhiều lần an toàn trên Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.office_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150)  NOT NULL,
    category        VARCHAR(80)   NOT NULL DEFAULT 'Dụng cụ sự kiện',
    total_qty       INT           NOT NULL DEFAULT 1,
    available_qty   INT           NOT NULL DEFAULT 1,
    unit            VARCHAR(30)   NOT NULL DEFAULT 'Cái',
    condition_note  TEXT,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by      VARCHAR(120),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_office_items_qty CHECK (total_qty >= 0 AND available_qty >= 0)
);

CREATE TABLE IF NOT EXISTS public.office_borrow_requests (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code         VARCHAR(80)   NOT NULL,
    unit_name         VARCHAR(180)  NOT NULL,
    requester_email   VARCHAR(120)  NOT NULL,
    requester_name    VARCHAR(150),
    requester_phone   VARCHAR(30),
    purpose           TEXT          NOT NULL,
    borrow_date       DATE          NOT NULL,
    due_date          DATE          NOT NULL,
    status            VARCHAR(20)   NOT NULL DEFAULT 'pending',
    approved_by       VARCHAR(120),
    approved_at       TIMESTAMPTZ,
    handed_over_at    TIMESTAMPTZ,
    returned_at       TIMESTAMPTZ,
    return_confirmed_by VARCHAR(120),
    late_days         INT           NOT NULL DEFAULT 0,
    admin_note        TEXT,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_office_borrow_dates  CHECK (borrow_date <= due_date),
    CONSTRAINT chk_office_borrow_status CHECK (status IN ('pending', 'approved', 'borrowed', 'returned', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_office_borrow_unit ON public.office_borrow_requests (unit_code);
CREATE INDEX IF NOT EXISTS idx_office_borrow_email ON public.office_borrow_requests (LOWER(requester_email));
CREATE INDEX IF NOT EXISTS idx_office_borrow_status ON public.office_borrow_requests (status);

CREATE TABLE IF NOT EXISTS public.office_borrow_items (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID          NOT NULL REFERENCES public.office_borrow_requests(id) ON DELETE CASCADE,
    item_id     UUID          REFERENCES public.office_items(id) ON DELETE SET NULL,
    item_name   VARCHAR(150)  NOT NULL,
    quantity    INT           NOT NULL DEFAULT 1,
    CONSTRAINT chk_office_borrow_item_qty CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_office_borrow_items_req ON public.office_borrow_items (request_id);

CREATE TABLE IF NOT EXISTS public.office_borrow_bans (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code     VARCHAR(80)   NOT NULL,
    unit_name     VARCHAR(180)  NOT NULL,
    request_id    UUID          REFERENCES public.office_borrow_requests(id) ON DELETE SET NULL,
    reason        TEXT          NOT NULL,
    banned_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    banned_until  TIMESTAMPTZ   NOT NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by    VARCHAR(120),
    unbanned_by   VARCHAR(120),
    unbanned_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_office_borrow_bans_unit ON public.office_borrow_bans (unit_code) WHERE is_active = TRUE;

-- RLS
ALTER TABLE public.office_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_borrow_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_borrow_bans     ENABLE ROW LEVEL SECURITY;

-- office_items: mọi tài khoản đăng nhập đọc được danh mục; Admin VPĐ ghi
DROP POLICY IF EXISTS "office_items_select" ON public.office_items;
CREATE POLICY "office_items_select" ON public.office_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "office_items_write" ON public.office_items;
CREATE POLICY "office_items_write" ON public.office_items FOR ALL TO authenticated
USING ((SELECT public.is_office_admin()))
WITH CHECK ((SELECT public.is_office_admin()));

-- office_borrow_requests: Admin VPĐ đọc/ghi tất cả; đơn vị đọc/tạo đơn của mình
DROP POLICY IF EXISTS "office_borrow_req_select" ON public.office_borrow_requests;
CREATE POLICY "office_borrow_req_select" ON public.office_borrow_requests FOR SELECT TO authenticated
USING (
  LOWER(requester_email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
  OR (SELECT public.is_office_admin())
);
DROP POLICY IF EXISTS "office_borrow_req_insert" ON public.office_borrow_requests;
CREATE POLICY "office_borrow_req_insert" ON public.office_borrow_requests FOR INSERT TO authenticated
WITH CHECK (
  LOWER(requester_email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
  OR (SELECT public.is_office_admin())
);
DROP POLICY IF EXISTS "office_borrow_req_admin_write" ON public.office_borrow_requests;
CREATE POLICY "office_borrow_req_admin_write" ON public.office_borrow_requests FOR UPDATE TO authenticated
USING ((SELECT public.is_office_admin()))
WITH CHECK ((SELECT public.is_office_admin()));
DROP POLICY IF EXISTS "office_borrow_req_admin_delete" ON public.office_borrow_requests;
CREATE POLICY "office_borrow_req_admin_delete" ON public.office_borrow_requests FOR DELETE TO authenticated
USING ((SELECT public.is_office_admin()));

-- office_borrow_items: đọc theo đơn cha; ghi khi tạo đơn hoặc Admin VPĐ
DROP POLICY IF EXISTS "office_borrow_items_select" ON public.office_borrow_items;
CREATE POLICY "office_borrow_items_select" ON public.office_borrow_items FOR SELECT TO authenticated
USING (
  (SELECT public.is_office_admin())
  OR EXISTS (
    SELECT 1 FROM public.office_borrow_requests r
    WHERE r.id = request_id
      AND LOWER(r.requester_email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
  )
);
DROP POLICY IF EXISTS "office_borrow_items_insert" ON public.office_borrow_items;
CREATE POLICY "office_borrow_items_insert" ON public.office_borrow_items FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_office_admin())
  OR EXISTS (
    SELECT 1 FROM public.office_borrow_requests r
    WHERE r.id = request_id
      AND LOWER(r.requester_email) = LOWER(COALESCE((SELECT public.current_user_email()), ''))
  )
);
DROP POLICY IF EXISTS "office_borrow_items_admin_write" ON public.office_borrow_items;
CREATE POLICY "office_borrow_items_admin_write" ON public.office_borrow_items FOR ALL TO authenticated
USING ((SELECT public.is_office_admin()))
WITH CHECK ((SELECT public.is_office_admin()));

-- office_borrow_bans: mọi tài khoản đăng nhập đọc được trạng thái cấm; Admin VPĐ ghi
DROP POLICY IF EXISTS "office_borrow_bans_select" ON public.office_borrow_bans;
CREATE POLICY "office_borrow_bans_select" ON public.office_borrow_bans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "office_borrow_bans_write" ON public.office_borrow_bans;
CREATE POLICY "office_borrow_bans_write" ON public.office_borrow_bans FOR ALL TO authenticated
USING ((SELECT public.is_office_admin()))
WITH CHECK ((SELECT public.is_office_admin()));

-- Seed một số dụng cụ phổ biến của Văn phòng Đoàn (chỉ chèn khi bảng trống)
INSERT INTO public.office_items (name, category, total_qty, available_qty, unit, condition_note, created_by)
SELECT v.name, v.category, v.total_qty, v.total_qty, v.unit, v.note, 'system'
FROM (VALUES
  ('Loa kéo di động + 2 micro', 'Âm thanh', 2, 'Bộ', 'Kiểm tra pin & micro trước khi giao'),
  ('Micro không dây cầm tay', 'Âm thanh', 4, 'Cái', 'Có kèm hộp'),
  ('Standee khung chữ X (60x160cm)', 'Truyền thông', 10, 'Cái', 'Kiểm tra đủ thanh chống'),
  ('Ổ cắm điện nối dài 10m', 'Thiết bị điện', 5, 'Cuộn', 'Cuộn gọn trước khi trả'),
  ('Cờ Đoàn / Cờ Tổ quốc có cán', 'Nghi lễ', 6, 'Cây', 'Giữ sạch, không làm rách'),
  ('Khăn trải bàn hội nghị', 'Sự kiện', 8, 'Cái', 'Gấp gọn sau khi dùng')
) AS v(name, category, total_qty, unit, note)
WHERE NOT EXISTS (SELECT 1 FROM public.office_items LIMIT 1);
