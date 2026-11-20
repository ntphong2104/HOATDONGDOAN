-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 015: Web Push Notifications (iOS 16.4+ PWA, Android Chrome, Desktop)
-- Zero-cost standard Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID ES256)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. VAPID Keypair Store (strictly locked to service_role; never readable by anon/authenticated)
CREATE TABLE IF NOT EXISTS public.push_vapid_keys (
  id text PRIMARY KEY DEFAULT 'default',
  public_key text NOT NULL,
  private_jwk jsonb NOT NULL,
  subject text NOT NULL DEFAULT 'mailto:nnguyenthanhphong2104@gmail.com',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_vapid_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_vapid_keys FROM anon, authenticated;

-- Public key lookup RPC (exposes ONLY public_key, never private_jwk)
CREATE OR REPLACE FUNCTION public.get_web_push_public_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public_key FROM public.push_vapid_keys WHERE id = 'default' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_web_push_public_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_web_push_public_key() TO authenticated;

-- 2. User Device Push Subscriptions (supports multiple devices per user)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  mssv text,
  lcd_code text,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_type text NOT NULL DEFAULT 'unknown',
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subs_email_active
  ON public.push_subscriptions (lower(user_email))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_push_subs_mssv_active
  ON public.push_subscriptions (upper(mssv))
  WHERE is_active = true AND mssv IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_subs_lcd_active
  ON public.push_subscriptions (lcd_code)
  WHERE is_active = true AND lcd_code IS NOT NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (lower(user_email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), '')));

DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (lower(user_email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), '')));

DROP POLICY IF EXISTS "push_subs_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_update_own" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (lower(user_email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), '')))
  WITH CHECK (lower(user_email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), '')));

DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (lower(user_email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), '')));

-- 3. Broadcast Notification Audit Log
CREATE TABLE IF NOT EXISTS public.push_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  url text,
  target_type text NOT NULL,
  target_value text,
  sent_by text NOT NULL,
  total_targets integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_logs_created_at
  ON public.push_logs (created_at DESC);

ALTER TABLE public.push_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_logs_select_super_admin" ON public.push_logs;
CREATE POLICY "push_logs_select_super_admin" ON public.push_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admins sa
      WHERE lower(sa.email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), ''))
    )
  );

NOTIFY pgrst, 'reload schema';
