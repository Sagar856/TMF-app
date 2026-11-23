-- Run after supabase_schema.sql. Cross-device review queue for payments
-- extracted by the SMS/notification parsers.
--
-- Every device pushes its locally queued sync operations through ONE atomic
-- RPC (sync_pending_notifications): the whole batch commits or none of it
-- does, and the authoritative snapshot it returns is read in the same
-- transaction, so devices can never observe a half-applied queue.
--
-- CONFLICT RULES (stale devices can never double-apply balances):
--   * A resolution ('added' / 'ignored') is a tombstone. The FIRST resolution
--     wins; later upserts or resolutions from stale devices are no-ops and
--     are reported back as conflicts so the device can warn the user.
--   * An upsert never resurrects a resolved entry, so a payment reviewed on
--     one device can never be re-added (and its balance re-applied) on another.
CREATE TABLE IF NOT EXISTS public.pending_notifications (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS pending_notifications_user_status_idx
  ON public.pending_notifications (user_id, status);

ALTER TABLE public.pending_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own pending notifications" ON public.pending_notifications;
CREATE POLICY "Users manage own pending notifications" ON public.pending_notifications
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND (SELECT public.has_verified_email()))
  WITH CHECK (auth.uid() = user_id AND (SELECT public.has_verified_email()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_notifications TO authenticated;

-- Applies a device's queued notification-sync operations atomically, in order,
-- and returns the user's authoritative pending/resolved snapshot plus the ids
-- of operations that lost a cross-device conflict (entry already resolved).
CREATE OR REPLACE FUNCTION public.sync_pending_notifications(ops jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  op jsonb;
  op_kind text;
  op_id text;
  op_status text;
  affected integer;
  conflicts jsonb := '[]'::jsonb;
BEGIN
  IF caller IS NULL OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required';
  END IF;
  IF ops IS NULL OR pg_catalog.jsonb_typeof(ops) <> 'array' OR pg_catalog.jsonb_array_length(ops) > 200 THEN
    RAISE EXCEPTION 'Invalid notification sync batch';
  END IF;

  FOR op IN SELECT value FROM pg_catalog.jsonb_array_elements(ops) LOOP
    op_kind := op->>'kind';
    op_id := op->>'id';
    IF op_id IS NULL OR pg_catalog.length(op_id) = 0 OR pg_catalog.length(op_id) > 160 THEN
      RAISE EXCEPTION 'Invalid notification id in sync batch';
    END IF;

    IF op_kind = 'upsert' THEN
      IF op->'payload' IS NULL OR pg_catalog.jsonb_typeof(op->'payload') <> 'object' THEN
        RAISE EXCEPTION 'Invalid notification payload in sync batch';
      END IF;
      INSERT INTO public.pending_notifications AS pn (user_id, id, payload)
      VALUES (caller, op_id, op->'payload')
      ON CONFLICT (user_id, id) DO UPDATE
        SET payload = EXCLUDED.payload, updated_at = NOW()
        WHERE pn.status = 'pending'; -- resolved entries are tombstones: never resurrected

    ELSIF op_kind = 'resolve' THEN
      op_status := op->>'status';
      IF op_status IS NULL OR op_status NOT IN ('added', 'ignored') THEN
        RAISE EXCEPTION 'Invalid notification resolution in sync batch';
      END IF;
      INSERT INTO public.pending_notifications AS pn (user_id, id, payload, status, resolved_at)
      VALUES (caller, op_id, COALESCE(op->'payload', '{}'::jsonb), op_status, NOW())
      ON CONFLICT (user_id, id) DO UPDATE
        SET status = EXCLUDED.status, resolved_at = NOW(), updated_at = NOW()
        WHERE pn.status = 'pending'; -- the first resolution wins across devices
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected = 0 THEN
        conflicts := conflicts || pg_catalog.to_jsonb(op_id);
      END IF;

    ELSE
      RAISE EXCEPTION 'Unknown notification sync operation';
    END IF;
  END LOOP;

  -- Tombstones have served their purpose once every device has pulled them.
  DELETE FROM public.pending_notifications
    WHERE user_id = caller AND status <> 'pending'
      AND resolved_at < NOW() - INTERVAL '30 days';

  RETURN (
    SELECT pg_catalog.jsonb_build_object(
      'pending', COALESCE(pg_catalog.jsonb_agg(payload ORDER BY created_at DESC)
        FILTER (WHERE status = 'pending'), '[]'::jsonb),
      'resolved', COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id, 'status', status))
        FILTER (WHERE status <> 'pending'), '[]'::jsonb),
      'conflicts', conflicts
    )
    FROM public.pending_notifications
    WHERE user_id = caller
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sync_pending_notifications(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_pending_notifications(jsonb) TO authenticated;
