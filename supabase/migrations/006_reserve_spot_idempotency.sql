-- Migration: 006_reserve_spot_idempotency
-- Adds idempotency to the reserve_spot_v2 RPC to prevent double deduction
-- of credits if the client retries the request due to token storm/network issues.

CREATE OR REPLACE FUNCTION reserve_spot_v2(
  p_class_id UUID,
  p_user_id UUID,
  p_spot_data JSONB
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
BEGIN
  -- STEP 1: Lock de perfil (evita race conditions)
  SELECT credits_indoor, credits_train, credits_pilates, credits_open
  INTO v_credits_indoor, v_credits_train, v_credits_pilates, v_credits_open
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado en el sistema.';
  END IF;

  -- STEP 2: Lock de clase y obtener disciplina
  SELECT occupied_spots, discipline INTO v_occupied, v_discipline
  FROM classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada.';
  END IF;

  -- STEP 3: Verificar reserva duplicada
  IF v_occupied @> jsonb_build_array(
    jsonb_build_object('userId', p_user_id::text)
  ) THEN
    RAISE EXCEPTION 'Ya tienes una reserva en esta clase';
  END IF;

  -- STEP 4: Verificar que el lugar no esté ocupado
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_occupied) AS elem
    WHERE (elem->>'spot')::INT = (p_spot_data->>'spot')::INT
  ) THEN
    RAISE EXCEPTION 'El lugar ya está ocupado';
  END IF;

  -- STEP 4.5: Idempotencia - Verificar si hay un ledger muy reciente
  -- Previene descuento doble en reintentos rápidos (menos de 30 segundos)
  IF EXISTS (
      SELECT 1 FROM credit_ledger
      WHERE user_id = p_user_id
        AND reference_id = p_class_id::text
        AND transaction_type = 'class_reservation'
        AND created_at > NOW() - INTERVAL '30 seconds'
  ) THEN
      RAISE EXCEPTION 'Reserva en proceso. Por favor recarga la página.';
  END IF;

  -- STEP 5: Determinar crédito a consumir
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
        RAISE EXCEPTION 'Sin créditos para Indoor Cycling. Adquiere un plan de Indoor Cycling o una Membresía VIP.';
      END IF;

    WHEN 'Train' THEN
      -- Train y Pilates comparten el pool credits_pilates (paquete pte_*)
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
        RAISE EXCEPTION 'Sin créditos para Train. Adquiere un plan de Pilates/Train o una Membresía VIP.';
      END IF;

    WHEN 'Pilates' THEN
      -- Pilates y Train comparten el pool credits_pilates (paquete pte_*)
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
        RAISE EXCEPTION 'Sin créditos para Pilates. Adquiere un plan de Pilates/Train o una Membresía VIP.';
      END IF;

    ELSE
      IF v_credits_open > 0 THEN
        v_credit_col  := 'open';
        v_old_credits := v_credits_open;
        v_new_credits := v_credits_open - 1;
      ELSIF v_credits_indoor + v_credits_train + v_credits_pilates > 0 THEN
        RAISE EXCEPTION 'Tus créditos son específicos de otra disciplina. Adquiere acceso para esta clase.';
      ELSE
        RAISE EXCEPTION 'No tienes clases disponibles. Adquiere un plan para continuar.';
      END IF;
  END CASE;

  -- STEP 6: Descontar crédito
  IF v_credit_col = 'indoor' THEN
    UPDATE profiles SET credits_indoor  = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'train' THEN
    UPDATE profiles SET credits_train   = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'pilates' THEN
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = p_user_id;
  ELSE
    UPDATE profiles SET credits_open    = v_new_credits WHERE id = p_user_id;
  END IF;

  -- STEP 7: Añadir usuario a occupied_spots
  UPDATE classes
  SET occupied_spots = COALESCE(occupied_spots, '[]'::jsonb) || jsonb_build_array(p_spot_data)
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error crítico: no se pudo actualizar la clase. Operación cancelada.';
  END IF;

  -- STEP 8: Ledger de auditoría
  INSERT INTO credit_ledger (
    user_id, amount, transaction_type, previous_balance, new_balance,
    reference_id, credit_type
  ) VALUES (
    p_user_id, -1, 'class_reservation', v_old_credits, v_new_credits,
    p_class_id::text, v_credit_col
  );

END;
$$;
