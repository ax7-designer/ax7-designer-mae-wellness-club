-- Migration: 008_credit_expiration
-- Adds a 30-day expiration date to credits

-- 1. Add expiration date column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_expiration_date TIMESTAMPTZ;

-- 2. Update add_credits_by_email
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


-- 3. Update add_credits_by_id_v2
CREATE OR REPLACE FUNCTION add_credits_by_id_v2(
  p_user_id       UUID,
  p_amount        INT,
  p_reference_id  TEXT DEFAULT NULL,
  p_credit_type   TEXT DEFAULT 'open'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_credits INT;
  v_new_credits INT;
BEGIN
  -- Idempotency: Rechazar si ya se procesó este payment_intent
  IF p_reference_id IS NOT NULL THEN
    PERFORM 1 FROM credit_ledger
    WHERE reference_id = p_reference_id
      AND transaction_type = 'stripe_webhook';

    IF FOUND THEN
      RAISE EXCEPTION 'DUPLICATE_WEBHOOK: payment_intent % ya fue procesado.', p_reference_id;
    END IF;
  END IF;

  -- Lockear perfil
  SELECT id INTO v_old_credits FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id;
  END IF;

  -- Actualizar columna correcta
  IF p_credit_type = 'indoor' THEN
    SELECT credits_indoor INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_indoor = v_new_credits WHERE id = p_user_id;

  ELSIF p_credit_type = 'train' THEN
    SELECT credits_train INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_train = v_new_credits WHERE id = p_user_id;

  ELSIF p_credit_type = 'pilates' THEN
    SELECT credits_pilates INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = p_user_id;

  ELSE -- 'open'
    SELECT credits_open INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_open = v_new_credits WHERE id = p_user_id;
  END IF;

  -- Set/Extend Expiration Date
  UPDATE profiles SET credits_expiration_date = NOW() + INTERVAL '30 days' WHERE id = p_user_id;

  INSERT INTO credit_ledger (
    user_id, amount, transaction_type, previous_balance, new_balance,
    reference_id, credit_type
  ) VALUES (
    p_user_id, p_amount, 'stripe_webhook', v_old_credits, v_new_credits,
    p_reference_id, p_credit_type
  );

END;
$$;


-- 4. Update reserve_spot_v2
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
  v_expiration      TIMESTAMPTZ;
  v_discipline      TEXT;
  v_occupied        JSONB;
  v_credit_col      TEXT;
  v_old_credits     INT;
  v_new_credits     INT;
BEGIN
  -- STEP 1: Lock de perfil (evita race conditions)
  SELECT credits_indoor, credits_train, credits_pilates, credits_open, credits_expiration_date
  INTO v_credits_indoor, v_credits_train, v_credits_pilates, v_credits_open, v_expiration
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado en el sistema.';
  END IF;

  IF v_expiration IS NOT NULL AND v_expiration < NOW() THEN
    RAISE EXCEPTION 'Tus créditos han expirado. Adquiere un nuevo paquete para reactivarlos.';
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


-- 5. Create sweeping function
CREATE OR REPLACE FUNCTION sweep_expired_credits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_total_credits INT;
BEGIN
  FOR v_profile IN
    SELECT id, credits_indoor, credits_train, credits_pilates, credits_open, credits
    FROM profiles
    WHERE credits_expiration_date < NOW()
      AND (credits_indoor > 0 OR credits_train > 0 OR credits_pilates > 0 OR credits_open > 0)
  LOOP
    v_total_credits := v_profile.credits_indoor + v_profile.credits_train + v_profile.credits_pilates + v_profile.credits_open;

    -- Zero out all credits
    UPDATE profiles
    SET credits_indoor = 0,
        credits_train = 0,
        credits_pilates = 0,
        credits_open = 0,
        credits = 0,
        credits_expiration_date = NULL
    WHERE id = v_profile.id;

    -- Log the expiration in ledger
    INSERT INTO credit_ledger (
      user_id, amount, transaction_type, previous_balance, new_balance, notes, credit_type
    ) VALUES (
      v_profile.id, -v_total_credits, 'manual_admin', v_profile.credits, 0, 'Expiración automática de 30 días', 'open'
    );
  END LOOP;
END;
$$;


-- 6. Schedule daily sweep (Runs daily at midnight UTC)
-- Requires pg_cron extension
SELECT cron.schedule(
  'sweep-expired-credits',
  '0 0 * * *',
  'SELECT sweep_expired_credits();'
);
