-- Rollback for Migration 009: Admin Role Security
-- Drops profiles.role column and restores original functions without backend role assertions.

-- 1. Restore add_credits_by_email to 008 state (no admin role check)
CREATE OR REPLACE FUNCTION add_credits_by_email(
  target_email  TEXT,
  amount        INT,
  p_admin_id    UUID DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL,
  p_credit_type TEXT DEFAULT 'open'
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
  IF p_credit_type NOT IN ('indoor', 'train', 'pilates', 'open') THEN
    RAISE EXCEPTION 'Tipo de crédito inválido: %. Usa: indoor | train | pilates | open', p_credit_type;
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'La cantidad de créditos debe ser mayor a 0.';
  END IF;

  -- Buscar y lockear usuario
  SELECT id INTO v_target_id
  FROM profiles
  WHERE email_fallback ILIKE target_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario con email "%" no encontrado.', target_email;
  END IF;

  -- Actualizar la columna correcta
  IF p_credit_type = 'indoor' THEN
    SELECT credits_indoor INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_indoor = v_new_credits WHERE id = v_target_id;

  ELSIF p_credit_type = 'train' THEN
    SELECT credits_train INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_train = v_new_credits WHERE id = v_target_id;

  ELSIF p_credit_type = 'pilates' THEN
    SELECT credits_pilates INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = v_target_id;

  ELSE -- 'open' (VIP comodín)
    SELECT credits_open INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_open = v_new_credits WHERE id = v_target_id;
  END IF;

  -- Set/Extend Expiration Date
  UPDATE profiles SET credits_expiration_date = NOW() + INTERVAL '30 days' WHERE id = v_target_id;

  -- Ledger con tipo
  INSERT INTO credit_ledger (
    user_id, admin_id, amount, transaction_type, previous_balance, new_balance,
    notes, credit_type
  ) VALUES (
    v_target_id, p_admin_id, amount, 'manual_admin',
    v_old_credits, v_new_credits,
    COALESCE(p_notes, 'Asignación manual sin nota'),
    p_credit_type
  );

  RETURN jsonb_build_object(
    'user_id',          v_target_id,
    'email',            target_email,
    'credit_type',      p_credit_type,
    'previous_balance', v_old_credits,
    'new_balance',      v_new_credits,
    'amount_added',     amount,
    'expiration_date',  (NOW() + INTERVAL '30 days')
  );

END;
$$;

-- 2. Restore admin_reserve_spot_v2 to 007 state (no admin role check)
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
  -- Verify the caller (admin) exists in profiles
  SELECT email_fallback INTO v_admin_email
  FROM profiles WHERE id = p_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin no encontrado en el sistema.';
  END IF;

  -- Lock del perfil del cliente
  SELECT credits_indoor, credits_train, credits_pilates, credits_open
  INTO v_credits_indoor, v_credits_train, v_credits_pilates, v_credits_open
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado en el sistema.';
  END IF;

  -- Lock de clase
  SELECT occupied_spots, discipline INTO v_occupied, v_discipline
  FROM classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada.';
  END IF;

  -- Verificar que el cliente no tenga ya una reserva en esta clase
  IF v_occupied @> jsonb_build_array(
    jsonb_build_object('userId', p_user_id::text)
  ) THEN
    RAISE EXCEPTION 'Este cliente ya tiene una reserva en esta clase.';
  END IF;

  -- Verificar que el lugar esté libre
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_occupied) AS elem
    WHERE (elem->>'spot')::INT = (p_spot_data->>'spot')::INT
  ) THEN
    RAISE EXCEPTION 'El lugar ya está ocupado.';
  END IF;

  -- Descontar crédito (solo si p_deduct_credits = TRUE)
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

  -- Añadir cliente a occupied_spots
  UPDATE classes
  SET occupied_spots = COALESCE(occupied_spots, '[]'::jsonb) || jsonb_build_array(p_spot_data)
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error crítico: no se pudo actualizar la clase. Operación cancelada.';
  END IF;

END;
$$;

-- 3. Restore mark_attendance to 001 state (no admin role check)
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

-- 4. Restore get_all_users_admin to 002 state (no admin role check)
CREATE OR REPLACE FUNCTION get_all_users_admin()
RETURNS TABLE (
  id                  UUID,
  nombre              TEXT,
  apodo               TEXT,
  email               TEXT,
  creditos_indoor     INT,
  creditos_train      INT,
  creditos_pilates    INT,
  creditos_vip        INT,
  total_creditos      INT,
  disciplina_preferida TEXT,
  fecha_registro      TEXT,
  ultima_actualizacion TEXT,
  ultima_compra       TIMESTAMPTZ,
  clases_tomadas_total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM admin_users_credits;
END;
$$;

-- 5. Drop role column from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
