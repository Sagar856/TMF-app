-- =======================================================
-- ADMIN CONSOLE: users, subscriptions, activity, usage
-- Run AFTER supabase_schema.sql in the Supabase SQL Editor.
--
-- Security model: every admin capability is a SECURITY DEFINER function that
-- first checks public.is_admin(). The client never gets direct table access to
-- other users' rows, so a tampered front-end cannot escalate privileges.
--
-- To create an admin (run manually in the SQL editor, never from the app):
--   INSERT INTO public.admin_users (user_id)
--   SELECT id FROM auth.users WHERE email = 'you@example.com';
-- =======================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
     AND (SELECT public.has_verified_email());
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- One subscription row per user. status is derived: active only when not
-- revoked and not expired (expires_at NULL = lifetime).
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'lifetime')),
  source TEXT NOT NULL DEFAULT 'admin_grant' CHECK (source IN ('admin_grant', 'purchase', 'trial')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own subscription" ON public.subscriptions;
CREATE POLICY "Users read own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

-- Lightweight per-user activity (one row per user, updated by heartbeat).
CREATE TABLE IF NOT EXISTS public.user_activity (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_count INTEGER NOT NULL DEFAULT 1,
  platform TEXT,
  app_version TEXT
);
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_activity FROM PUBLIC, anon, authenticated;

-- Heartbeat: callers can only touch their own row. p_new_session increments the
-- session counter (call once per app launch); regular beats only bump last_seen_at.
CREATE OR REPLACE FUNCTION public.record_activity(p_platform text, p_app_version text, p_new_session boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (SELECT public.has_verified_email()) THEN
    RETURN;
  END IF;
  INSERT INTO public.user_activity (user_id, platform, app_version)
  VALUES (auth.uid(), pg_catalog.left(p_platform, 32), pg_catalog.left(p_app_version, 32))
  ON CONFLICT (user_id) DO UPDATE SET
    last_seen_at = NOW(),
    platform = EXCLUDED.platform,
    app_version = EXCLUDED.app_version,
    session_count = public.user_activity.session_count + CASE WHEN p_new_session THEN 1 ELSE 0 END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_activity(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_activity(text, text, boolean) TO authenticated;

-- Effective plan for the signed-in user ('free' when none/expired/revoked).
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS TABLE (plan text, active boolean, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE WHEN s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > NOW()) THEN s.plan ELSE 'free' END,
    s.revoked_at IS NULL AND s.plan <> 'free' AND (s.expires_at IS NULL OR s.expires_at > NOW()),
    s.expires_at
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;

-- ---------- Admin-only RPCs ----------

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid, email text, display_name text, created_at timestamptz,
  last_sign_in_at timestamptz, email_confirmed boolean, banned boolean, is_admin boolean,
  plan text, subscription_active boolean, subscription_expires_at timestamptz,
  last_seen_at timestamptz, session_count integer, platform text, app_version text,
  transaction_count bigint, account_count bigint, investment_count bigint, loan_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    u.id, u.email::text,
    COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')::text,
    u.created_at, u.last_sign_in_at,
    u.email_confirmed_at IS NOT NULL,
    u.banned_until IS NOT NULL AND u.banned_until > NOW(),
    EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = u.id),
    CASE WHEN s.user_id IS NOT NULL AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > NOW()) THEN s.plan ELSE 'free' END,
    s.user_id IS NOT NULL AND s.revoked_at IS NULL AND s.plan <> 'free' AND (s.expires_at IS NULL OR s.expires_at > NOW()),
    s.expires_at,
    ua.last_seen_at, ua.session_count, ua.platform, ua.app_version,
    (SELECT COUNT(*) FROM public.transactions t WHERE t.user_id = u.id),
    (SELECT COUNT(*) FROM public.financial_accounts f WHERE f.user_id = u.id),
    (SELECT COUNT(*) FROM public.investments i WHERE i.user_id = u.id),
    (SELECT COUNT(*) FROM public.loans l WHERE l.user_id = u.id)
  FROM auth.users u
  LEFT JOIN public.subscriptions s ON s.user_id = u.id
  LEFT JOIN public.user_activity ua ON ua.user_id = u.id
  WHERE u.deleted_at IS NULL
  ORDER BY u.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_grant_subscription(
  p_user_id uuid, p_plan text, p_days integer DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expires timestamptz;
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_plan NOT IN ('premium', 'lifetime') THEN
    RAISE EXCEPTION 'Plan must be premium or lifetime' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = '22023';
  END IF;
  IF p_plan = 'premium' THEN
    IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
      RAISE EXCEPTION 'Premium requires 1-3650 days' USING ERRCODE = '22023';
    END IF;
    -- Extend from the current expiry when the user is still active.
    SELECT GREATEST(COALESCE(
      (SELECT s.expires_at FROM public.subscriptions s
        WHERE s.user_id = p_user_id AND s.revoked_at IS NULL AND s.plan = 'premium'), NOW()), NOW())
      + pg_catalog.make_interval(days => p_days) INTO v_expires;
  END IF;
  INSERT INTO public.subscriptions (user_id, plan, source, starts_at, expires_at, revoked_at, granted_by, note, updated_at)
  VALUES (p_user_id, p_plan, 'admin_grant', NOW(), v_expires, NULL, auth.uid(), pg_catalog.left(p_note, 500), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    plan = EXCLUDED.plan, source = 'admin_grant', starts_at = NOW(), expires_at = EXCLUDED.expires_at,
    revoked_at = NULL, granted_by = EXCLUDED.granted_by, note = EXCLUDED.note, updated_at = NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.admin_grant_subscription(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_subscription(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.subscriptions
    SET revoked_at = NOW(), granted_by = auth.uid(), updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_revoke_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_subscription(uuid) TO authenticated;

-- Suspend / reinstate a user. Admins cannot suspend themselves or other admins.
CREATE OR REPLACE FUNCTION public.admin_set_user_suspended(p_user_id uuid, p_suspended boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Cannot suspend an admin account' USING ERRCODE = '42501';
  END IF;
  UPDATE auth.users
    SET banned_until = CASE WHEN p_suspended THEN NOW() + INTERVAL '100 years' ELSE NULL END
    WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_suspended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(uuid, boolean) TO authenticated;

-- Wipe a user's financial data but keep the account, subscription and activity.
CREATE OR REPLACE FUNCTION public.admin_delete_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Cannot delete data of an admin account' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.transactions WHERE user_id = p_user_id;
  DELETE FROM public.categories WHERE user_id = p_user_id;
  DELETE FROM public.financial_accounts WHERE user_id = p_user_id;
  DELETE FROM public.investments WHERE user_id = p_user_id;
  DELETE FROM public.loans WHERE user_id = p_user_id;
  DELETE FROM public.user_settings WHERE user_id = p_user_id;
  DELETE FROM public.user_preferences WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_user_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data(uuid) TO authenticated;

-- Permanently delete a user and (via ON DELETE CASCADE) all of their data.
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Cannot delete an admin account' USING ERRCODE = '42501';
  END IF;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_usage_summary()
RETURNS TABLE (
  total_users bigint, verified_users bigint, new_users_7d bigint,
  active_users_24h bigint, active_users_7d bigint, active_users_30d bigint,
  premium_users bigint, free_users bigint, suspended_users bigint,
  total_transactions bigint, total_accounts bigint, total_investments bigint, total_loans bigint,
  total_sessions bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH u AS (SELECT * FROM auth.users WHERE deleted_at IS NULL),
  prem AS (
    SELECT COUNT(*) AS n FROM public.subscriptions s
    JOIN u ON u.id = s.user_id
    WHERE s.revoked_at IS NULL AND s.plan <> 'free' AND (s.expires_at IS NULL OR s.expires_at > NOW())
  )
  SELECT
    (SELECT COUNT(*) FROM u),
    (SELECT COUNT(*) FROM u WHERE email_confirmed_at IS NOT NULL),
    (SELECT COUNT(*) FROM u WHERE created_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM public.user_activity WHERE last_seen_at > NOW() - INTERVAL '24 hours'),
    (SELECT COUNT(*) FROM public.user_activity WHERE last_seen_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM public.user_activity WHERE last_seen_at > NOW() - INTERVAL '30 days'),
    (SELECT n FROM prem),
    (SELECT COUNT(*) FROM u) - (SELECT n FROM prem),
    (SELECT COUNT(*) FROM u WHERE banned_until IS NOT NULL AND banned_until > NOW()),
    (SELECT COUNT(*) FROM public.transactions),
    (SELECT COUNT(*) FROM public.financial_accounts),
    (SELECT COUNT(*) FROM public.investments),
    (SELECT COUNT(*) FROM public.loans),
    (SELECT COALESCE(SUM(session_count), 0) FROM public.user_activity);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_usage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_usage_summary() TO authenticated;
