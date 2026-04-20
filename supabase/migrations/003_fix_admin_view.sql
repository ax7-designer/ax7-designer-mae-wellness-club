-- ============================================================
-- MAE WELLNESS CLUB — MIGRATION 003 (COMPLETA Y AUTÓNOMA)
-- Reemplaza y corrige todo lo de 002 que falló.
-- Es segura de ejecutar múltiples veces (idempotente).
-- ============================================================

-- ============================================================
-- BLOQUE 1: Añadir columnas de créditos por disciplina
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS credits_indoor  INT NOT NULL DEFAULT 0 CHECK (credits_indoor  >= 0),
  ADD COLUMN IF NOT EXISTS credits_train   INT NOT NULL DEFAULT 0 CHECK (credits_train   >= 0),
  ADD COLUMN IF NOT EXISTS credits_pilates INT NOT NULL DEFAULT 0 CHECK (credits_pilates >= 0),
  ADD COLUMN IF NOT EXISTS credits_open    INT NOT NULL DEFAULT 0 CHECK (credits_open    >= 0);

-- Migrar créditos existentes → credits_open (VIP comodín)
-- Solo si el usuario tiene créditos y aún no se migraron
UPDATE profiles
SET credits_open = credits
WHERE credits > 0
  AND credits_open = 0;

-- Añadir columna credit_type al ledger (trazabilidad)
ALTER TABLE credit_ledger
  ADD COLUMN IF NOT EXISTS credit_type TEXT DEFAULT 'open'
    CHECK (credit_type IN ('indoor', 'train', 'pilates', 'open'));

-- ============================================================
-- BLOQUE 2: Trigger — mantiene 'credits' = suma de todos
-- ============================================================

CREATE OR REPLACE FUNCTION sync_total_credits()
RETURNS TRIGGER AS $$
BEGIN
  NEW.credits := COALESCE(NEW.credits_open, 0)
               + COALESCE(NEW.credits_indoor, 0)
               + COALESCE(NEW.credits_train, 0)
               + COALESCE(NEW.credits_pilates, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_total_credits ON profiles;
CREATE TRIGGER trg_sync_total_credits
  BEFORE INSERT OR UPDATE OF credits_open, credits_indoor, credits_train, credits_pilates
  ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_total_credits();

-- ============================================================
-- BLOQUE 3: reserve_spot_v2 con lógica de disciplinas
--
-- REGLAS DE CONSUMO:
--   Indoor Cycling: credits_indoor → credits_open → ERROR
--   Train:          credits_train  → credits_pilates → credits_open → ERROR
--   Pilates:        credits_pilates → credits_train  → credits_open → ERROR
--
-- FILOSOFÍA: Pilates y Train comparten el pool 'credits_pilates'
--            (mismo paquete Stripe pte_*). Indoor es AISLADO.
-- ============================================================

CREATE OR REPLACE FUNCTION reserve_spot_v2(
  p_class_id  UUID,
  p_user_id   UUID,
  p_spot_data JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  SET occupied_spots = occupied_spots || jsonb_build_array(p_spot_data)
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

GRANT EXECUTE ON FUNCTION reserve_spot_v2(UUID, UUID, JSONB) TO authenticated;

-- ============================================================
-- BLOQUE 4: cancel_reservation_v2
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
  v_credits_open    INT;
  v_credits_indoor  INT;
  v_credits_train   INT;
  v_credits_pilates INT;
  v_discipline      TEXT;
  v_credit_col      TEXT;
  v_old_credits     INT;
  v_new_credits     INT;
BEGIN
  SELECT credits_open, credits_indoor, credits_train, credits_pilates
  INTO v_credits_open, v_credits_indoor, v_credits_train, v_credits_pilates
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.';
  END IF;

  SELECT discipline INTO v_discipline
  FROM classes
  WHERE id = p_class_id
    AND occupied_spots @> jsonb_build_array(
      jsonb_build_object('userId', p_user_id::text)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes una reserva activa en esta clase.';
  END IF;

  -- Buscar en el ledger qué tipo de crédito se usó
  SELECT credit_type INTO v_credit_col
  FROM credit_ledger
  WHERE user_id = p_user_id
    AND reference_id = p_class_id::text
    AND transaction_type = 'class_reservation'
    AND amount = -1
  ORDER BY created_at DESC
  LIMIT 1;

  -- Fallback: inferir por disciplina si no hay registro en ledger
  IF v_credit_col IS NULL THEN
    CASE v_discipline
      WHEN 'Indoor Cycling' THEN v_credit_col := 'indoor';
      WHEN 'Train'          THEN v_credit_col := 'pilates';
      WHEN 'Pilates'        THEN v_credit_col := 'pilates';
      ELSE                       v_credit_col := 'open';
    END CASE;
  END IF;

  -- Remover de clase
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

  -- Devolver crédito al tipo correcto
  IF v_credit_col = 'indoor' THEN
    v_old_credits := v_credits_indoor;
    v_new_credits := v_credits_indoor + 1;
    UPDATE profiles SET credits_indoor  = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'train' THEN
    v_old_credits := v_credits_train;
    v_new_credits := v_credits_train + 1;
    UPDATE profiles SET credits_train   = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'pilates' THEN
    v_old_credits := v_credits_pilates;
    v_new_credits := v_credits_pilates + 1;
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = p_user_id;
  ELSE
    v_old_credits := v_credits_open;
    v_new_credits := v_credits_open + 1;
    UPDATE profiles SET credits_open    = v_new_credits WHERE id = p_user_id;
  END IF;

  INSERT INTO credit_ledger (
    user_id, amount, transaction_type, previous_balance, new_balance,
    reference_id, credit_type
  ) VALUES (
    p_user_id, +1, 'class_cancellation', v_old_credits, v_new_credits,
    p_class_id::text, v_credit_col
  );

END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_v2(UUID, UUID, INT) TO authenticated;

-- ============================================================
-- BLOQUE 5: add_credits_by_email (admin manual)
-- ============================================================

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
  v_target_id   UUID;
  v_old_credits INT;
  v_new_credits INT;
BEGIN
  IF p_credit_type NOT IN ('indoor', 'train', 'pilates', 'open') THEN
    RAISE EXCEPTION 'Tipo de crédito inválido: %. Usa: indoor | train | pilates | open', p_credit_type;
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'La cantidad de créditos debe ser mayor a 0.';
  END IF;

  SELECT id INTO v_target_id
  FROM profiles
  WHERE email_fallback ILIKE target_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario con email "%" no encontrado.', target_email;
  END IF;

  IF p_credit_type = 'indoor' THEN
    SELECT credits_indoor  INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_indoor  = v_new_credits WHERE id = v_target_id;
  ELSIF p_credit_type = 'train' THEN
    SELECT credits_train   INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_train   = v_new_credits WHERE id = v_target_id;
  ELSIF p_credit_type = 'pilates' THEN
    SELECT credits_pilates INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = v_target_id;
  ELSE
    SELECT credits_open    INTO v_old_credits FROM profiles WHERE id = v_target_id;
    v_new_credits := v_old_credits + amount;
    UPDATE profiles SET credits_open    = v_new_credits WHERE id = v_target_id;
  END IF;

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
    'amount_added',     amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_credits_by_email(TEXT, INT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- BLOQUE 6: add_credits_by_id_v2 (Stripe webhook)
-- ============================================================

CREATE OR REPLACE FUNCTION add_credits_by_id_v2(
  p_user_id      UUID,
  p_amount       INT,
  p_reference_id TEXT DEFAULT NULL,
  p_credit_type  TEXT DEFAULT 'open'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_credits INT;
  v_new_credits INT;
BEGIN
  -- Idempotencia: evitar doble procesamiento del mismo webhook
  IF p_reference_id IS NOT NULL THEN
    PERFORM 1 FROM credit_ledger
    WHERE reference_id = p_reference_id
      AND transaction_type = 'stripe_webhook';

    IF FOUND THEN
      RAISE EXCEPTION 'DUPLICATE_WEBHOOK: % ya fue procesado.', p_reference_id;
    END IF;
  END IF;

  PERFORM id FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id;
  END IF;

  IF p_credit_type = 'indoor' THEN
    SELECT credits_indoor  INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_indoor  = v_new_credits WHERE id = p_user_id;
  ELSIF p_credit_type = 'train' THEN
    SELECT credits_train   INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_train   = v_new_credits WHERE id = p_user_id;
  ELSIF p_credit_type = 'pilates' THEN
    SELECT credits_pilates INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = p_user_id;
  ELSE
    SELECT credits_open    INTO v_old_credits FROM profiles WHERE id = p_user_id;
    v_new_credits := v_old_credits + p_amount;
    UPDATE profiles SET credits_open    = v_new_credits WHERE id = p_user_id;
  END IF;

  INSERT INTO credit_ledger (
    user_id, amount, transaction_type, previous_balance, new_balance,
    reference_id, credit_type
  ) VALUES (
    p_user_id, p_amount, 'stripe_webhook', v_old_credits, v_new_credits,
    p_reference_id, p_credit_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_credits_by_id_v2(UUID, INT, TEXT, TEXT) TO service_role;

-- ============================================================
-- BLOQUE 7: REPARACIÓN — sira.armas@gmail.com
-- Tenía 5 créditos Indoor, bug le dejó 4. Se le repone 1.
-- ============================================================

DO $$
DECLARE
  v_user_id       UUID;
  v_already_fixed BOOLEAN := FALSE;
  v_has_res       BOOLEAN := FALSE;
  v_result        JSONB;
BEGIN
  SELECT id INTO v_user_id
  FROM profiles
  WHERE email_fallback ILIKE 'sira.armas@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'SKIP: sira.armas@gmail.com no encontrada.';
    RETURN;
  END IF;

  RAISE NOTICE 'Sira found — id: %', v_user_id;

  -- Evitar doble reembolso
  SELECT COUNT(*) > 0 INTO v_already_fixed
  FROM credit_ledger
  WHERE user_id = v_user_id
    AND transaction_type = 'manual_admin'
    AND notes ILIKE '%Reembolso%2026-04-20%';

  IF v_already_fixed THEN
    RAISE NOTICE 'SKIP: reembolso ya aplicado previamente.';
    RETURN;
  END IF;

  -- Verificar reserva activa (si ya reservó, el crédito no se perdió)
  SELECT (id IS NOT NULL) INTO v_has_res
  FROM classes
  WHERE date BETWEEN '2026-04-20' AND '2026-04-21'
    AND discipline = 'Indoor Cycling'
    AND occupied_spots @> jsonb_build_array(
      jsonb_build_object('userId', v_user_id::text)
    )
  LIMIT 1;

  IF v_has_res THEN
    RAISE NOTICE 'SKIP: tiene reserva activa — crédito no se perdió.';
    RETURN;
  END IF;

  -- Ejecutar reembolso
  SELECT add_credits_by_email(
    'sira.armas@gmail.com',
    1,
    NULL,
    'Reembolso — crédito Indoor Cycling descontado sin reserva exitosa. 2026-04-20',
    'indoor'
  ) INTO v_result;

  RAISE NOTICE 'ÉXITO: crédito restituido. Resultado: %', v_result::text;
END;
$$;

-- ============================================================
-- BLOQUE 8: Vista admin (sin created_at, usa updated_at)
-- ============================================================

DROP VIEW IF EXISTS admin_users_credits;

CREATE OR REPLACE VIEW admin_users_credits AS
SELECT
  p.id,
  p.full_name                                          AS nombre,
  p.nickname                                           AS apodo,
  p.email_fallback                                     AS email,
  p.credits_indoor                                     AS creditos_indoor,
  p.credits_train                                      AS creditos_train,
  p.credits_pilates                                    AS creditos_pilates,
  p.credits_open                                       AS creditos_vip,
  p.credits                                            AS total_creditos,
  p.preferred_discipline                               AS disciplina_preferida,
  TO_CHAR(p.updated_at, 'DD/MM/YYYY HH24:MI')         AS ultima_actualizacion,
  (
    SELECT cl.created_at
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type IN ('stripe_webhook', 'manual_admin')
      AND cl.amount > 0
    ORDER BY cl.created_at DESC
    LIMIT 1
  )                                                    AS ultima_compra,
  (
    SELECT COUNT(*)
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type = 'class_reservation'
  )                                                    AS clases_tomadas_total
FROM profiles p
ORDER BY p.updated_at DESC NULLS LAST;

-- ============================================================
-- BLOQUE 9: Función wrapper para la vista (uso interno / futuro)
-- ============================================================

CREATE OR REPLACE FUNCTION get_all_users_admin()
RETURNS TABLE (
  id                   UUID,
  nombre               TEXT,
  apodo                TEXT,
  email                TEXT,
  creditos_indoor      INT,
  creditos_train       INT,
  creditos_pilates     INT,
  creditos_vip         INT,
  total_creditos       INT,
  disciplina_preferida TEXT,
  ultima_actualizacion TEXT,
  ultima_compra        TIMESTAMPTZ,
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

GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;
