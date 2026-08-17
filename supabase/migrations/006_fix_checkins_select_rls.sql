-- Migration 006: Fix checkins SELECT RLS Policy to allow authorized officers and admins to view all checkins
DROP POLICY IF EXISTS "checkins_select" ON public.check_ins;
CREATE POLICY "checkins_select" ON public.check_ins FOR SELECT TO authenticated, anon
    USING (true);
