-- ═══════════════════════════════════════════════════════════════════
-- Migration: Tạo bảng session_checkins + RPC atomic check-in
-- Chạy SQL này trong Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tạo bảng session_checkins thay thế JSON trong system_settings
CREATE TABLE IF NOT EXISTS session_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  session_id TEXT NOT NULL DEFAULT 'main',
  session_name TEXT DEFAULT 'Buổi chính',
  mssv TEXT NOT NULL,
  participate_role TEXT DEFAULT 'participant',
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  checked_by TEXT DEFAULT 'System',
  UNIQUE(event_id, session_id, mssv)
);

-- Indexes cho truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_session_checkins_event
  ON session_checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_session_checkins_event_session
  ON session_checkins(event_id, session_id);
CREATE INDEX IF NOT EXISTS idx_session_checkins_mssv
  ON session_checkins(mssv);

-- 2. RPC: Atomic check-in (kiểm tra capacity + insert trong 1 transaction)
--    Trả về JSON { "success": bool, "error": string?, "is_duplicate": bool? }
CREATE OR REPLACE FUNCTION checkin_atomic(
  p_event_id UUID,
  p_session_id TEXT,
  p_session_name TEXT,
  p_mssv TEXT,
  p_role TEXT DEFAULT 'participant',
  p_checked_by TEXT DEFAULT 'System',
  p_max_participants INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_count INT;
  v_session_exists BOOLEAN;
  v_global_exists BOOLEAN;
BEGIN
  -- Check session duplicate (cheap index lookup)
  SELECT EXISTS(
    SELECT 1 FROM session_checkins
    WHERE event_id = p_event_id
      AND session_id = p_session_id
      AND UPPER(mssv) = UPPER(p_mssv)
  ) INTO v_session_exists;

  IF v_session_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_duplicate', true,
      'error', 'Đã điểm danh buổi này rồi'
    );
  END IF;

  -- Atomic capacity check (only if max > 0)
  IF p_max_participants > 0 THEN
    -- Advisory lock on event_id to serialize capacity checks for same event
    -- This prevents TOCTOU: all 2000 requests seeing count < max simultaneously
    PERFORM pg_advisory_xact_lock(hashtext(p_event_id::text));

    SELECT COUNT(*) INTO v_current_count
    FROM check_ins
    WHERE event_id = p_event_id;

    IF v_current_count >= p_max_participants THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Sự kiện đã ĐẦY (%s/%s người)', v_current_count, p_max_participants)
      );
    END IF;
  END IF;

  -- Insert session check-in (concurrent-safe via UNIQUE constraint)
  BEGIN
    INSERT INTO session_checkins (event_id, session_id, session_name, mssv, participate_role, checked_by)
    VALUES (p_event_id, p_session_id, p_session_name, UPPER(p_mssv), p_role, p_checked_by);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_duplicate', true,
      'error', 'Đã điểm danh buổi này rồi (concurrent)'
    );
  END;

  -- Upsert global check_ins (ignore duplicate)
  INSERT INTO check_ins (event_id, mssv, participate_role, checked_by)
  VALUES (p_event_id, UPPER(p_mssv), p_role, p_checked_by)
  ON CONFLICT (event_id, mssv) DO NOTHING;

  -- Sync event_registrations attended = true
  UPDATE event_registrations
  SET attended = true
  WHERE event_id = p_event_id AND UPPER(mssv) = UPPER(p_mssv);

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'mssv', UPPER(p_mssv)
  );
END;
$$;

-- 3. Migrate dữ liệu cũ từ system_settings JSON sang bảng mới
-- (Chạy 1 lần rồi xóa)
DO $$
DECLARE
  rec RECORD;
  checkin_item JSONB;
BEGIN
  FOR rec IN
    SELECT key, value FROM system_settings
    WHERE key LIKE 'event_session_checkins_%'
  LOOP
    BEGIN
      FOR checkin_item IN SELECT jsonb_array_elements(rec.value::jsonb)
      LOOP
        INSERT INTO session_checkins (
          event_id, session_id, session_name, mssv,
          participate_role, checked_at, checked_by
        ) VALUES (
          (checkin_item->>'event_id')::UUID,
          COALESCE(checkin_item->>'session_id', 'main'),
          COALESCE(checkin_item->>'session_name', 'Buổi chính'),
          UPPER(COALESCE(checkin_item->>'mssv', '')),
          COALESCE(checkin_item->>'participate_role', 'participant'),
          COALESCE((checkin_item->>'checked_at')::TIMESTAMPTZ, NOW()),
          COALESCE(checkin_item->>'checked_by', 'Migrated')
        )
        ON CONFLICT (event_id, session_id, mssv) DO NOTHING;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped key %: %', rec.key, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- 4. (Tùy chọn) Xóa dữ liệu JSON cũ sau khi migrate xong
-- DELETE FROM system_settings WHERE key LIKE 'event_session_checkins_%';

-- 5. Grant quyền cho anon/authenticated roles
GRANT SELECT, INSERT ON session_checkins TO anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_atomic TO anon, authenticated;
