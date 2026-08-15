-- ════════════════════════════════════════════
-- MIGRATION 002: Row Level Security Policies
-- ════════════════════════════════════════════

-- ─── Helper Functions ───

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT (auth.jwt() -> 'user_metadata' ->> 'email')
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.super_admins
        WHERE email = (SELECT public.current_user_email())
    )
$$;

CREATE OR REPLACE FUNCTION public.has_event_role(p_event_id UUID, p_role_types TEXT[] DEFAULT ARRAY['event_admin', 'checker'])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.event_roles
        WHERE event_id = p_event_id
          AND email = (SELECT public.current_user_email())
          AND role_type = ANY(p_role_types)
    )
$$;

-- ─── USERS ───
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated
    USING (email = (SELECT public.current_user_email()) OR (SELECT public.is_super_admin()));

CREATE POLICY "users_insert_admin" ON public.users FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_super_admin()));

CREATE POLICY "users_update_admin" ON public.users FOR UPDATE TO authenticated
    USING ((SELECT public.is_super_admin()));

-- ─── EVENTS ───
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;

CREATE POLICY "events_select_all" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "events_insert_admin" ON public.events FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY "events_update_admin" ON public.events FOR UPDATE TO authenticated
    USING ((SELECT public.is_super_admin()));

-- ─── EVENT_ROLES ───
ALTER TABLE public.event_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY "event_roles_select" ON public.event_roles FOR SELECT TO authenticated
    USING (
        (SELECT public.is_super_admin())
        OR email = (SELECT public.current_user_email())
        OR (SELECT public.has_event_role(event_id, ARRAY['event_admin']))
    );

CREATE POLICY "event_roles_insert" ON public.event_roles FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.is_super_admin())
        OR (role_type = 'checker' AND (SELECT public.has_event_role(event_id, ARRAY['event_admin'])))
    );

CREATE POLICY "event_roles_delete" ON public.event_roles FOR DELETE TO authenticated
    USING (
        (SELECT public.is_super_admin())
        OR (SELECT public.has_event_role(event_id, ARRAY['event_admin']))
    );

-- ─── CHECK_INS ───
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins FORCE ROW LEVEL SECURITY;

CREATE POLICY "checkins_select" ON public.check_ins FOR SELECT TO authenticated
    USING (
        mssv = (SELECT u.mssv FROM public.users u WHERE u.email = (SELECT public.current_user_email()))
        OR (SELECT public.is_super_admin())
        OR (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
    );

CREATE POLICY "checkins_insert" ON public.check_ins FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.has_event_role(event_id, ARRAY['event_admin', 'checker']))
        OR (SELECT public.is_super_admin())
    );

-- ─── SUPER_ADMINS ───
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins FORCE ROW LEVEL SECURITY;

CREATE POLICY "super_admins_select" ON public.super_admins FOR SELECT TO authenticated
    USING ((SELECT public.is_super_admin()));

-- ─── SYSTEM_SETTINGS ───
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_all" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_update_admin" ON public.system_settings FOR UPDATE TO authenticated
    USING ((SELECT public.is_super_admin()));
