-- ════════════════════════════════════════════
-- MIGRATION 003: Triggers & Auth Hook
-- ════════════════════════════════════════════

-- Trigger: Block check-in when event is closed
CREATE OR REPLACE FUNCTION public.fn_block_closed_event_checkin()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM public.events WHERE event_id = NEW.event_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_status = 'closed' THEN
        RAISE EXCEPTION 'Event is closed. Check-in denied.' USING ERRCODE = 'P0003';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_block_closed_event
    BEFORE INSERT ON public.check_ins
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_block_closed_event_checkin();

-- Auth Hook: Restrict email domain
-- Configure in Dashboard → Auth → Hooks → Before User Created
CREATE OR REPLACE FUNCTION public.fn_restrict_email_domain(event JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    user_email TEXT;
BEGIN
    user_email := event -> 'record' ->> 'email';

    IF user_email NOT LIKE '%@ptit.edu.vn' THEN
        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 403,
                'message', 'Chỉ chấp nhận email @ptit.edu.vn'
            )
        );
    END IF;

    RETURN jsonb_build_object();
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_restrict_email_domain TO supabase_auth_admin;

-- Seed data for development
INSERT INTO public.super_admins (email) VALUES
    ('admin@ptit.edu.vn')
ON CONFLICT (email) DO NOTHING;
