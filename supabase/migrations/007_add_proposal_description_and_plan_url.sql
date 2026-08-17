-- Migration 007: Add description and plan_url columns to event_proposals
ALTER TABLE public.event_proposals
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS plan_url TEXT;

COMMENT ON COLUMN public.event_proposals.description IS 'Mô tả tóm tắt / Kế hoạch sơ bộ của chương trình';
COMMENT ON COLUMN public.event_proposals.plan_url IS 'Link file kế hoạch chi tiết (Google Drive / PDF / Docx)';
