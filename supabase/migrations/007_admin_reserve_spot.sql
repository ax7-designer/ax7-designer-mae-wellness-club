-- Migration: 007_admin_reserve_spot
-- Adds admin_reserve_spot_v2 RPC for admin-assisted client bookings.
-- Key difference vs reserve_spot_v2:
--   - Caller must be authenticated as an ADMIN (validated via ADMIN_EMAILS check in app layer)
--   - p_admin_id: the admin performing the action (for audit trail)
--   - p_user_id:  the CLIENT whose spot is being reserved
--   - p_deduct_credits: if FALSE, the spot is reserved WITHOUT consuming a credit
--     (e.g. client paid cash, admin handles billing separately)

CREATE OR REPLACE FUNCTION admin_reserve_spot_v2(
  p_class_id       UUID,
  p_user_id        UUID,
  p_admin_id       UUID,
  p_spot_data      JSONB,
  p_deduct_credits BOOLEAN DEFAULT TRUE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits_indoor  INT;
  v_credits_train   INT;
  v_credits_pilates INT;
  v_credits_open    INT;
  v_discipline      TEXT;
  v_occupied        JSONB;
  v_credit_col      TEXT;
  v_old_credits     INT;
  v_new_credits     INT;
  v_admin_email     TEXT;
BEGIN
  -- STEP 0: Verify the caller (admin) exists in profiles
  SELECT email_fallback INTO v_admin_email
  FROM profiles WHERE id = p_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin no encontrado en el sistema.';
  END IF;

  -- STEP 1: Lock del perfil del cliente
  SELECT credits_indoor, credits_train, credits_pilates, credits_open
  INTO v_credits_indoor, v_credits_train, v_credits_pilates, v_credits_open
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado en el sistema.';
  END IF;

  -- STEP 2: Lock de clase
  SELECT occupied_spots, discipline INTO v_occupied, v_discipline
  FROM classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada.';
  END IF;

  -- STEP 3: Verificar que el cliente no tenga ya una reserva en esta clase
  IF v_occupied @> jsonb_build_array(
    jsonb_build_object('userId', p_user_id::text)
  ) THEN
    RAISE EXCEPTION 'Este cliente ya tiene una reserva en esta clase.';
  END IF;

  -- STEP 4: Verificar que el lugar esté libre
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_occupied) AS elem
    WHERE (elem->>'spot')::INT = (p_spot_data->>'spot')::INT
  ) THEN
    RAISE EXCEPTION 'El lugar ya está ocupado.';
  END IF;

  -- STEP 5: Descontar crédito (solo si p_deduct_credits = TRUE)
  IF p_deduct_credits THEN
    CASE v_discipline
      WHEN 'Indoor Cycling' THEN
        IF v_credits_indoor > 0 THEN
          v_credit_col  := 'indoor';
          v_old_credits := v_credits_indoor;
          v_new_credits := v_credits_indoor - 1;
        ELSIF v_credits_open > 0 THEN
          v_credit_col  := 'open';
          v_old_credits := v_credits_open;
          v_new_credits := v_credits_open - 1;
        ELSE
          RAISE EXCEPTION 'El cliente no tiene créditos para Indoor Cycling.';
        END IF;

      WHEN 'Train' THEN
        IF v_credits_train > 0 THEN
          v_credit_col  := 'train';
          v_old_credits := v_credits_train;
          v_new_credits := v_credits_train - 1;
        ELSIF v_credits_pilates > 0 THEN
          v_credit_col  := 'pilates';
          v_old_credits := v_credits_pilates;
          v_new_credits := v_credits_pilates - 1;
        ELSIF v_credits_open > 0 THEN
          v_credit_col  := 'open';
          v_old_credits := v_credits_open;
          v_new_credits := v_credits_open - 1;
        ELSE
          RAISE EXCEPTION 'El cliente no tiene créditos para Train.';
        END IF;

      WHEN 'Pilates' THEN
        IF v_credits_pilates > 0 THEN
          v_credit_col  := 'pilates';
          v_old_credits := v_credits_pilates;
          v_new_credits := v_credits_pilates - 1;
        ELSIF v_credits_train > 0 THEN
          v_credit_col  := 'train';
          v_old_credits := v_credits_train;
          v_new_credits := v_credits_train - 1;
        ELSIF v_credits_open > 0 THEN
          v_credit_col  := 'open';
          v_old_credits := v_credits_open;
          v_new_credits := v_credits_open - 1;
        ELSE
          RAISE EXCEPTION 'El cliente no tiene créditos para Pilates.';
        END IF;

      ELSE
        IF v_credits_open > 0 THEN
          v_credit_col  := 'open';
          v_old_credits := v_credits_open;
          v_new_credits := v_credits_open - 1;
        ELSE
          RAISE EXCEPTION 'El cliente no tiene créditos disponibles.';
        END IF;
    END CASE;

    -- Apply credit deduction
    IF v_credit_col = 'indoor' THEN
      UPDATE profiles SET credits_indoor  = v_new_credits WHERE id = p_user_id;
    ELSIF v_credit_col = 'train' THEN
      UPDATE profiles SET credits_train   = v_new_credits WHERE id = p_user_id;
    ELSIF v_credit_col = 'pilates' THEN
      UPDATE profiles SET credits_pilates = v_new_credits WHERE id = p_user_id;
    ELSE
      UPDATE profiles SET credits_open    = v_new_credits WHERE id = p_user_id;
    END IF;

    -- Audit ledger entry for credit deduction
    INSERT INTO credit_ledger (
      user_id, amount, transaction_type, previous_balance, new_balance,
      reference_id, credit_type, notes
    ) VALUES (
      p_user_id, -1, 'class_reservation', v_old_credits, v_new_credits,
      p_class_id::text, v_credit_col,
      'Reserva asistida por admin: ' || v_admin_email
    );

  END IF; -- END p_deduct_credits block

  -- STEP 6: Añadir cliente a occupied_spots
  UPDATE classes
  SET occupied_spots = COALESCE(occupied_spots, '[]'::jsonb) || jsonb_build_array(p_spot_data)
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error crítico: no se pudo actualizar la clase. Operación cancelada.';
  END IF;

END;
$$;
