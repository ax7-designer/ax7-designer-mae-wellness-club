-- ============================================================
-- MAE WELLNESS CLUB — MIGRATION 001
-- Credit Ledger + Atomic RPC Fixes + Class Attendance
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- FASE 1: EMERGENCY — Fix reserve_spot_v2 (SECURITY DEFINER)
-- Root cause: INVOKER permissions let RLS silently block the
-- UPDATE to 'classes', causing credit deduction without
-- updating occupied_spots. Now SECURITY DEFINER bypasses RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION reserve_spot_v2(
  p_class_id  UUID,
  p_user_id   UUID,
  p_spot_data JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER          -- Bypasses RLS. Runs as function owner.
SET search_path = public
AS $$
DECLARE
  v_credits     INT;
  v_new_credits INT;
  v_occupied    JSONB;
BEGIN
  -- STEP 1: Lock the user's profile row to prevent credit race conditions
  SELECT credits INTO v_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado en el sistema.';
  END IF;

  IF v_credits <= 0 THEN
    RAISE EXCEPTION 'Créditos insuficientes';
  END IF;

  -- STEP 2: Lock the class row to prevent double-booking
  SELECT occupied_spots INTO v_occupied
  FROM classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada.';
  END IF;

  -- STEP 3: Check this user doesn't already have a spot in this class
  IF v_occupied @> jsonb_build_array(
    jsonb_build_object('userId', p_user_id::text)
  ) THEN
    RAISE EXCEPTION 'Ya tienes una reserva en esta clase';
  END IF;

  -- STEP 4: Check the specific spot number isn't already taken
  IF v_occupied @> jsonb_build_array(p_spot_data) THEN
    RAISE EXCEPTION 'El lugar ya está ocupado';
  END IF;

  -- STEP 5: Deduct credit
  v_new_credits := v_credits - 1;
  UPDATE profiles
  SET credits = v_new_credits
  WHERE id = p_user_id;

  -- STEP 6: Append user to occupied_spots
  UPDATE classes
  SET occupied_spots = occupied_spots || jsonb_build_array(p_spot_data)
  WHERE id = p_class_id;

  -- STEP 7: Validate the class update actually happened
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error crítico: no se pudo actualizar la clase. Operación cancelada.';
  END IF;

  -- STEP 8: Write to credit ledger (immutable audit trail)
  INSERT INTO credit_ledger (
    user_id, amount, transaction_type, previous_balance, new_balance, reference_id
  ) VALUES (
    p_user_id, -1, 'class_reservation', v_credits, v_new_credits, p_class_id::text
  );

END;
$$;

GRANT EXECUTE ON FUNCTION reserve_spot_v2(UUID, UUID, JSONB) TO authenticated;

-- ============================================================
-- Fix cancel_reservation_v2 with SECURITY DEFINER + ledger
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_reservation_v2(
  p_class_id UUID,
  p_user_id  UUID,
  p_spot     INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits     INT;
  v_new_credits INT;
BEGIN
  -- Lock profile row
  SELECT credits INTO v_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.';
  END IF;

  -- Verify that the user actually has a reservation in this class
  PERFORM 1 FROM classes
  WHERE id = p_class_id
    AND occupied_spots @> jsonb_build_array(
      jsonb_build_object('userId', p_user_id::text)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes una reserva activa en esta clase.';
  END IF;

  -- Remove the user from occupied_spots
  UPDATE classes
  SET occupied_spots = (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(occupied_spots) AS elem
    WHERE (elem->>'userId')::TEXT != p_user_id::TEXT
  )
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error al cancelar: clase no encontrada.';
  END IF;

  -- Refund credit
  v_new_credits := v_credits + 1;
  UPDATE profiles SET credits = v_new_credits WHERE id = p_user_id;

  -- Write to credit ledger
  INSERT INTO credit_ledger (
    user_id, amount, transaction_type, previous_balance, new_balance, reference_id
  ) VALUES (
    p_user_id, +1, 'class_cancellation', v_credits, v_new_credits, p_class_id::text
  );

END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_v2(UUID, UUID, INT) TO authenticated;

-- ============================================================
-- FASE 2: CREDIT LEDGER — Immutable Audit Table
-- ============================================================

-- 1. Transaction type enum
DO $$ BEGIN
  CREATE TYPE credit_transaction_type AS ENUM (
    'stripe_webhook',
    'manual_admin',
    'class_reservation',
    'class_cancellation'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL; -- Already exists, skip
END $$;

-- 2. The credit_ledger table
CREATE TABLE IF NOT EXISTS credit_ledger (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  admin_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  amount           INT         NOT NULL,
  transaction_type credit_transaction_type NOT NULL,
  previous_balance INT         NOT NULL,
  new_balance      INT         NOT NULL,
  reference_id     TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id    ON credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON credit_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_type       ON credit_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_ref        ON credit_ledger(reference_id) WHERE reference_id IS NOT NULL;

-- 4. RLS: Users see only their own records
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own ledger" ON credit_ledger;
CREATE POLICY "Users see own ledger" ON credit_ledger
  FOR SELECT USING (auth.uid() = user_id);

-- 5. Immutability rules — prevent UPDATE and DELETE on the ledger
DROP RULE IF EXISTS no_update_ledger ON credit_ledger;
DROP RULE IF EXISTS no_delete_ledger ON credit_ledger;
CREATE RULE no_update_ledger AS ON UPDATE TO credit_ledger DO INSTEAD NOTHING;
CREATE RULE no_delete_ledger AS ON DELETE TO credit_ledger DO INSTEAD NOTHING;

-- ============================================================
-- Refactored: add_credits_by_email — with audit + safer search
-- Now returns JSONB so the frontend can confirm what happened
-- ============================================================

CREATE OR REPLACE FUNCTION add_credits_by_email(
  target_email  TEXT,
  amount        INT,
  p_admin_id    UUID DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id    UUID;
  v_old_credits  INT;
  v_new_credits  INT;
BEGIN
  -- Find user by email_fallback (case-insensitive)
  SELECT id, credits INTO v_target_id, v_old_credits
  FROM profiles
  WHERE email_fallback ILIKE target_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario con email "%" no encontrado.', target_email;
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'La cantidad de créditos debe ser mayor a 0.';
  END IF;

  v_new_credits := v_old_credits + amount;

  -- Update credits
  UPDATE profiles SET credits = v_new_credits WHERE id = v_target_id;

  -- Ledger entry with admin traceability
  INSERT INTO credit_ledger (
    user_id, admin_id, amount, transaction_type, previous_balance, new_balance, notes
  ) VALUES (
    v_target_id, p_admin_id, amount, 'manual_admin',
    v_old_credits, v_new_credits,
    COALESCE(p_notes, 'Asignación manual sin nota')
  );

  -- Return rich response for the frontend to display
  RETURN jsonb_build_object(
    'user_id',          v_target_id,
    'email',            target_email,
    'previous_balance', v_old_credits,
    'new_balance',      v_new_credits,
    'amount_added',     amount
  );

END;
$$;

GRANT EXECUTE ON FUNCTION add_credits_by_email(TEXT, INT, UUID, TEXT) TO authenticated;

-- ============================================================
-- Refactored: add_credits_by_id_v2 — Stripe Webhook version
-- Now includes idempotency check to prevent duplicate payouts
-- ============================================================

CREATE OR REPLACE FUNCTION add_credits_by_id_v2(
  p_user_id       UUID,
  p_amount        INT,
  p_reference_id  TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_credits INT;
  v_new_credits INT;
BEGIN
  SELECT credits INTO v_old_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id;
  END IF;

  -- Idempotency: Reject if this payment_intent was already processed
  IF p_reference_id IS NOT NULL THEN
    PERFORM 1 FROM credit_ledger
    WHERE reference_id = p_reference_id
      AND transaction_type = 'stripe_webhook';

    IF FOUND THEN
      RAISE EXCEPTION 'DUPLICATE_WEBHOOK: payment_intent % ya fue procesado.', p_reference_id;
    END IF;
  END IF;

  v_new_credits := v_old_credits + p_amount;

  UPDATE profiles SET credits = v_new_credits WHERE id = p_user_id;

  INSERT INTO credit_ledger (
    user_id, amount, transaction_type, previous_balance, new_balance, reference_id
  ) VALUES (
    p_user_id, p_amount, 'stripe_webhook', v_old_credits, v_new_credits, p_reference_id
  );

END;
$$;

-- Webhook is called with service_role key, not 'authenticated'
GRANT EXECUTE ON FUNCTION add_credits_by_id_v2(UUID, INT, TEXT) TO service_role;

-- ============================================================
-- FASE 3B: CLASS ATTENDANCE — Physical Check-in System
-- ============================================================

CREATE TABLE IF NOT EXISTS class_attendance (
  id             BIGSERIAL PRIMARY KEY,
  class_id       UUID        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  spot_number    INT         NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'reserved'
                 CHECK (status IN ('reserved', 'attended', 'no_show')),
  checked_in_at  TIMESTAMPTZ,
  checked_in_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON class_attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user_id  ON class_attendance(user_id);

ALTER TABLE class_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage attendance" ON class_attendance;
CREATE POLICY "Admins manage attendance" ON class_attendance
  USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: mark_attendance — Admin marks who showed up
-- ============================================================

CREATE OR REPLACE FUNCTION mark_attendance(
  p_class_id UUID,
  p_user_id  UUID,
  p_status   TEXT,
  p_admin_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spot INT;
BEGIN
  IF p_status NOT IN ('attended', 'no_show', 'reserved') THEN
    RAISE EXCEPTION 'Estado inválido. Usa: attended | no_show | reserved';
  END IF;

  -- Get the spot number from the class's occupied_spots
  SELECT (elem->>'spot')::INT INTO v_spot
  FROM classes, jsonb_array_elements(occupied_spots) AS elem
  WHERE id = p_class_id
    AND (elem->>'userId') = p_user_id::TEXT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario no tiene reserva en esta clase.';
  END IF;

  INSERT INTO class_attendance (class_id, user_id, spot_number, status, checked_in_at, checked_in_by)
  VALUES (
    p_class_id,
    p_user_id,
    v_spot,
    p_status,
    CASE WHEN p_status = 'attended' THEN NOW() ELSE NULL END,
    p_admin_id
  )
  ON CONFLICT (class_id, user_id) DO UPDATE
  SET
    status        = EXCLUDED.status,
    checked_in_at = EXCLUDED.checked_in_at,
    checked_in_by = EXCLUDED.checked_in_by;

END;
$$;

GRANT EXECUTE ON FUNCTION mark_attendance(UUID, UUID, TEXT, UUID) TO authenticated;
