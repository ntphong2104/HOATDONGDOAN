-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 010: Thêm Index tối ưu tốc độ truy vấn
--
-- Giải quyết:
-- 1. Thiếu index trên các bảng tạo trên Dashboard
-- 2. Thiếu index cho các truy vấn phổ biến trong API routes
-- 3. Thêm FK constraints cho session_checkins (thiếu trong migration gốc)
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────
-- PHẦN 1: INDEX CHO event_registrations
-- Bảng này bị query RẤT NHIỀU trong check-in, register, admin views
-- ───────────────────────────────────────

-- Query: .eq('event_id', ...).eq('mssv', ...) — Dùng trong check-in sync
-- Đây cũng là UNIQUE constraint (onConflict: 'event_id,mssv')
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_event_mssv
  ON public.event_registrations(event_id, mssv);

-- Query: .eq('event_id', ...).eq('email', ...) — Dùng khi sinh viên xem đăng ký
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_email
  ON public.event_registrations(event_id, email);

-- Query: .eq('event_id', ...).order('created_at') — Admin xem danh sách đăng ký
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id
  ON public.event_registrations(event_id);

-- Query: .eq('email', ...) — Xem lịch sử đăng ký của sinh viên
CREATE INDEX IF NOT EXISTS idx_event_registrations_email
  ON public.event_registrations(email);

-- Query: .eq('mssv', ...) — Tra cứu theo MSSV
CREATE INDEX IF NOT EXISTS idx_event_registrations_mssv
  ON public.event_registrations(mssv);

-- Query: count(*) WHERE attended = true — Admin stats
CREATE INDEX IF NOT EXISTS idx_event_registrations_attended
  ON public.event_registrations(attended)
  WHERE attended = true;

-- ───────────────────────────────────────
-- PHẦN 2: INDEX CHO event_proposals
-- Bảng này bị query trong proposal listing, conflict check, approval flow
-- ───────────────────────────────────────

-- Query: .eq('created_by', ...) — Xem đề xuất của mình
CREATE INDEX IF NOT EXISTS idx_event_proposals_created_by
  ON public.event_proposals(created_by);

-- Query: .eq('current_stage', ...).eq('status', 'pending') — Lọc theo stage phê duyệt
CREATE INDEX IF NOT EXISTS idx_event_proposals_stage_status
  ON public.event_proposals(current_stage, status)
  WHERE status = 'pending';

-- Query: .eq('room_id', ...).lt('start_datetime', ...).gt('end_datetime', ...) — Conflict check
CREATE INDEX IF NOT EXISTS idx_event_proposals_room_datetime
  ON public.event_proposals(room_id, start_datetime, end_datetime)
  WHERE status != 'rejected' AND status != 'deleted';

-- Query: .order('start_datetime') — Sắp xếp theo thời gian
CREATE INDEX IF NOT EXISTS idx_event_proposals_start_datetime
  ON public.event_proposals(start_datetime);

-- Query: .eq('created_event_id', ...) — Liên kết proposal → event
CREATE INDEX IF NOT EXISTS idx_event_proposals_created_event_id
  ON public.event_proposals(created_event_id)
  WHERE created_event_id IS NOT NULL;

-- ───────────────────────────────────────
-- PHẦN 3: INDEX CHO user_penalties
-- Bảng này bị query mỗi lần sinh viên đăng ký sự kiện (blacklist check)
-- ───────────────────────────────────────

-- Query: .eq('mssv', ...) — Kiểm tra blacklist khi đăng ký
CREATE INDEX IF NOT EXISTS idx_user_penalties_mssv
  ON public.user_penalties(mssv);

-- Query: .eq('is_blacklisted', true) — Danh sách blacklist
CREATE INDEX IF NOT EXISTS idx_user_penalties_blacklisted
  ON public.user_penalties(is_blacklisted)
  WHERE is_blacklisted = true;

-- ───────────────────────────────────────
-- PHẦN 4: INDEX CHO unit_ratings
-- ───────────────────────────────────────

-- Query: .eq('event_id', ...) — Xem đánh giá theo sự kiện
CREATE INDEX IF NOT EXISTS idx_unit_ratings_event_id
  ON public.unit_ratings(event_id);

-- Query: .eq('organization_unit', ...) — Tổng hợp đánh giá theo đơn vị
CREATE INDEX IF NOT EXISTS idx_unit_ratings_org_unit
  ON public.unit_ratings(organization_unit);

-- Query: .eq('proposal_id', ...) — Đánh giá theo đề xuất
CREATE INDEX IF NOT EXISTS idx_unit_ratings_proposal_id
  ON public.unit_ratings(proposal_id)
  WHERE proposal_id IS NOT NULL;

-- ───────────────────────────────────────
-- PHẦN 5: INDEX CHO proposal_logs
-- ───────────────────────────────────────

-- Query: .eq('proposal_id', ...).order('created_at') — Xem log phê duyệt
CREATE INDEX IF NOT EXISTS idx_proposal_logs_proposal_id
  ON public.proposal_logs(proposal_id);

-- ───────────────────────────────────────
-- PHẦN 6: INDEX CHO class_delegates
-- ───────────────────────────────────────

-- Query: .eq('email', ...) — Kiểm tra quyền BCS lớp
CREATE INDEX IF NOT EXISTS idx_class_delegates_email
  ON public.class_delegates(email);

-- Query: .eq('mssv', ...) — Tra cứu theo MSSV
CREATE INDEX IF NOT EXISTS idx_class_delegates_mssv
  ON public.class_delegates(mssv);

-- Query: .eq('class_id', ...).eq('is_active', true) — Tìm BCS theo lớp
CREATE INDEX IF NOT EXISTS idx_class_delegates_class_active
  ON public.class_delegates(class_id, is_active)
  WHERE is_active = true;

-- ───────────────────────────────────────
-- PHẦN 7: INDEX CHO rooms
-- ───────────────────────────────────────

-- Query: .eq('is_available', true) — Danh sách phòng khả dụng
CREATE INDEX IF NOT EXISTS idx_rooms_available
  ON public.rooms(is_available)
  WHERE is_available = true;

-- ───────────────────────────────────────
-- PHẦN 8: THÊM FK CONSTRAINTS CHO session_checkins
-- (Migration gốc 20260924 thiếu FK)
-- ───────────────────────────────────────

-- Chỉ thêm FK nếu chưa tồn tại (tránh lỗi khi chạy lại)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_session_checkins_event'
      AND table_name = 'session_checkins'
  ) THEN
    ALTER TABLE public.session_checkins
      ADD CONSTRAINT fk_session_checkins_event
      FOREIGN KEY (event_id) REFERENCES public.events(event_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ───────────────────────────────────────
-- PHẦN 9: BỔ SUNG INDEX CHO BẢNG GỐC (cải thiện thêm)
-- ───────────────────────────────────────

-- events: Composite index cho listing API phổ biến
CREATE INDEX IF NOT EXISTS idx_events_status_created
  ON public.events(status, created_at DESC);

-- events: Index cho event_date (dùng trong nhiều API routes)
CREATE INDEX IF NOT EXISTS idx_events_event_date
  ON public.events(event_date)
  WHERE event_date IS NOT NULL;

-- check_ins: Composite index cho count queries
CREATE INDEX IF NOT EXISTS idx_checkins_event_role
  ON public.check_ins(event_id, participate_role);

-- ═══════════════════════════════════════════════════════════════════
-- THỐNG KÊ INDEX ĐÃ TẠO:
--   event_registrations: 6 indexes (bao gồm 1 unique)
--   event_proposals:     5 indexes (3 partial)
--   user_penalties:      2 indexes (1 partial)
--   unit_ratings:        3 indexes (1 partial)
--   proposal_logs:       1 index
--   class_delegates:     3 indexes (1 partial)
--   rooms:               1 index (partial)
--   session_checkins:    1 FK constraint
--   events:              2 indexes bổ sung
--   check_ins:           1 index bổ sung
--   TỔNG: 25 indexes/constraints mới
-- ═══════════════════════════════════════════════════════════════════
