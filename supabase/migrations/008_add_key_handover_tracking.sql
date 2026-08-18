-- Migration 008: Add key handover tracking columns to event_proposals
ALTER TABLE IF EXISTS public.event_proposals
ADD COLUMN IF NOT EXISTS key_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS key_handed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS key_handed_by TEXT,
ADD COLUMN IF NOT EXISTS key_returned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS key_returned_by TEXT;

COMMENT ON COLUMN public.event_proposals.key_status IS 'Trạng thái bàn giao chìa khóa: pending (chưa giao), handed_over (đã giao), returned (đã trả)';
COMMENT ON COLUMN public.event_proposals.key_handed_at IS 'Thời điểm bảo vệ bàn giao chìa khóa cho người mượn';
COMMENT ON COLUMN public.event_proposals.key_handed_by IS 'Email bảo vệ thực hiện bàn giao';
COMMENT ON COLUMN public.event_proposals.key_returned_at IS 'Thời điểm bảo vệ nhận lại chìa khóa';
COMMENT ON COLUMN public.event_proposals.key_returned_by IS 'Email bảo vệ nhận lại chìa khóa';
