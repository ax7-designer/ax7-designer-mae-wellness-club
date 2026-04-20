-- ============================================================
-- MAE WELLNESS CLUB — MIGRATION 002
-- Sistema de Créditos por Disciplina + Vista de Usuarios (Admin)
--
-- FILOSOFÍA:
--   · credits_indoor  → solo para Indoor Cycling
--   · credits_train   → solo para Train
--   · credits_pilates → solo para Pilates
--   · credits_open    → VIP comodín (vale para cualquier disciplina)
--   · credits         → ALIAS de solo lectura = SUM de todos (backward compat)
--
-- ORDEN DE CONSUMO EN reserve_spot_v2:
--   1. Crédito específico de la disciplina (si > 0)
--   2. Crédito open/VIP (si > 0)
--   3. Si ambos = 0 → EXCEPTION
-- ============================================================

-- ============================================================
-- BLOQUE 1: Migrar esquema de profiles
-- ============================================================

-- 1a. Añadir columnas de créditos por disciplina (DEFAULT 0)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS credits_indoor  INT NOT NULL DEFAULT 0 CHECK (credits_indoor >= 0),
  ADD COLUMN IF NOT EXISTS credits_train   INT NOT NULL DEFAULT 0 CHECK (credits_train >= 0),
  ADD COLUMN IF NOT EXISTS credits_pilates INT NOT NULL DEFAULT 0 CHECK (credits_pilates >= 0),
  ADD COLUMN IF NOT EXISTS credits_open    INT NOT NULL DEFAULT 0 CHECK (credits_open >= 0);

-- 1b. Migrar saldo existente en 'credits' → 'credits_open'
--     (los créditos que los usuarios ya tienen son genéricos/comodín)
UPDATE profiles
SET credits_open = credits
WHERE credits > 0
  AND credits_open = 0; -- Solo migrar si no se ha hecho ya

-- NOTA: La columna 'credits' se mantiene para compatibilidad con código legacy
--       Se actualizará automáticamente via trigger (ver BLOQUE 2)

-- 1c. Añadir columna de tipo de Stripe product para trazabilidad en webhook
ALTER TABLE credit_ledger
  ADD COLUMN IF NOT EXISTS credit_type TEXT DEFAULT 'open'
    CHECK (credit_type IN ('indoor', 'train', 'pilates', 'open'));

-- ============================================================
-- BLOQUE 2: Trigger para mantener 'credits' sincronizado
--           como suma total (backward compat con código legacy)
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
-- BLOQUE 3: reserve_spot_v2 — Versión con disciplinas
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
  v_credit_col      TEXT;   -- qué columna se va a consumir
  v_old_credits     INT;
  v_new_credits     INT;
BEGIN
  -- STEP 1: Lock the user's profile row (evita race conditions)
  SELECT credits_indoor, credits_train, credits_pilates, credits_open
  INTO v_credits_indoor, v_credits_train, v_credits_pilates, v_credits_open
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado en el sistema.';
  END IF;

  -- STEP 2: Lock the class row and get discipline
  SELECT occupied_spots, discipline INTO v_occupied, v_discipline
  FROM classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada.';
  END IF;

  -- STEP 3: Check user doesn't already have a spot
  IF v_occupied @> jsonb_build_array(
    jsonb_build_object('userId', p_user_id::text)
  ) THEN
    RAISE EXCEPTION 'Ya tienes una reserva en esta clase';
  END IF;

  -- STEP 4: Check the specific spot isn't taken
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_occupied) AS elem
    WHERE (elem->>'spot')::INT = (p_spot_data->>'spot')::INT
  ) THEN
    RAISE EXCEPTION 'El lugar ya está ocupado';
  END IF;

  -- STEP 5: Determinar crédito a consumir según disciplina
  --   Prioridad: crédito específico → crédito open
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
      ELSIF v_credits_open > 0 THEN
        v_credit_col  := 'open';
        v_old_credits := v_credits_open;
        v_new_credits := v_credits_open - 1;
      ELSE
        RAISE EXCEPTION 'Sin créditos para Train. Adquiere un plan de Train/Pilates o una Membresía VIP.';
      END IF;

    WHEN 'Pilates' THEN
      IF v_credits_pilates > 0 THEN
        v_credit_col  := 'pilates';
        v_old_credits := v_credits_pilates;
        v_new_credits := v_credits_pilates - 1;
      ELSIF v_credits_open > 0 THEN
        v_credit_col  := 'open';
        v_old_credits := v_credits_open;
        v_new_credits := v_credits_open - 1;
      ELSE
        RAISE EXCEPTION 'Sin créditos para Pilates. Adquiere un plan de Train/Pilates o una Membresía VIP.';
      END IF;

    ELSE
      -- Disciplina desconocida: intentar cualquier crédito disponible
      IF v_credits_open > 0 THEN
        v_credit_col  := 'open';
        v_old_credits := v_credits_open;
        v_new_credits := v_credits_open - 1;
      ELSIF v_credits_indoor + v_credits_train + v_credits_pilates > 0 THEN
        RAISE EXCEPTION 'Tus créditos son específicos de una disciplina. Adquiere acceso para esta clase.';
      ELSE
        RAISE EXCEPTION 'No tienes clases disponibles. Adquiere un plan para continuar.';
      END IF;
  END CASE;

  -- STEP 6: Descontar el crédito correcto
  IF v_credit_col = 'indoor' THEN
    UPDATE profiles SET credits_indoor = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'train' THEN
    UPDATE profiles SET credits_train = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'pilates' THEN
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = p_user_id;
  ELSE
    UPDATE profiles SET credits_open = v_new_credits WHERE id = p_user_id;
  END IF;

  -- STEP 7: Agregar al usuario en occupied_spots
  UPDATE classes
  SET occupied_spots = occupied_spots || jsonb_build_array(p_spot_data)
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error crítico: no se pudo actualizar la clase. Operación cancelada.';
  END IF;

  -- STEP 8: Audit ledger
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
-- BLOQUE 4: cancel_reservation_v2 — Devuelve al tipo correcto
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
  -- Lock profile row
  SELECT credits_open, credits_indoor, credits_train, credits_pilates
  INTO v_credits_open, v_credits_indoor, v_credits_train, v_credits_pilates
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.';
  END IF;

  -- Verificar que el usuario tiene reserva en esta clase y obtener disciplina
  SELECT discipline INTO v_discipline
  FROM classes
  WHERE id = p_class_id
    AND occupied_spots @> jsonb_build_array(
      jsonb_build_object('userId', p_user_id::text)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes una reserva activa en esta clase.';
  END IF;

  -- Determinar a qué columna devolver el crédito
  -- Buscamos en el ledger el tipo de crédito que se usó originalmente
  SELECT credit_type INTO v_credit_col
  FROM credit_ledger
  WHERE user_id = p_user_id
    AND reference_id = p_class_id::text
    AND transaction_type = 'class_reservation'
    AND amount = -1
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si no encontramos en el ledger (registros legacy), usar disciplina como fallback
  IF v_credit_col IS NULL THEN
    IF v_discipline = 'Indoor Cycling' THEN
      v_credit_col := 'indoor';
    ELSIF v_discipline = 'Train' THEN
      v_credit_col := 'train';
    ELSIF v_discipline = 'Pilates' THEN
      v_credit_col := 'pilates';
    ELSE
      v_credit_col := 'open';
    END IF;
  END IF;

  -- Remover al usuario de occupied_spots
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
    UPDATE profiles SET credits_indoor = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'train' THEN
    v_old_credits := v_credits_train;
    v_new_credits := v_credits_train + 1;
    UPDATE profiles SET credits_train = v_new_credits WHERE id = p_user_id;
  ELSIF v_credit_col = 'pilates' THEN
    v_old_credits := v_credits_pilates;
    v_new_credits := v_credits_pilates + 1;
    UPDATE profiles SET credits_pilates = v_new_credits WHERE id = p_user_id;
  ELSE
    v_old_credits := v_credits_open;
    v_new_credits := v_credits_open + 1;
    UPDATE profiles SET credits_open = v_new_credits WHERE id = p_user_id;
  END IF;

  -- Ledger entry
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
-- BLOQUE 5: add_credits_by_email — versión con tipo de disciplina
-- ============================================================

CREATE OR REPLACE FUNCTION add_credits_by_email(
  target_email  TEXT,
  amount        INT,
  p_admin_id    UUID DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL,
  p_credit_type TEXT DEFAULT 'open'  -- 'indoor' | 'train' | 'pilates' | 'open'
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
    'amount_added',     amount
  );

END;
$$;

GRANT EXECUTE ON FUNCTION add_credits_by_email(TEXT, INT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- BLOQUE 6: add_credits_by_id_v2 — Stripe Webhook con disciplina
-- ============================================================

CREATE OR REPLACE FUNCTION add_credits_by_id_v2(
  p_user_id       UUID,
  p_amount        INT,
  p_reference_id  TEXT DEFAULT NULL,
  p_credit_type   TEXT DEFAULT 'open'  -- 'indoor' | 'train' | 'pilates' | 'open'
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
-- BLOQUE 7: REPARACIÓN de sira.armas@gmail.com
-- Ejecutar SOLO DESPUÉS de verificar en el SELECT que no
-- tiene reserva activa de Indoor Cycling 20-21 Abril 2026
-- ============================================================

-- 7a. Diagnóstico — Ejecuta primero:
/*
SELECT
  p.id,
  p.email_fallback,
  p.credits,
  p.credits_open,
  p.credits_indoor,
  p.credits_train,
  p.credits_pilates,
  p.full_name,
  p.nickname,
  p.created_at
FROM profiles p
WHERE p.email_fallback ILIKE 'sira.armas@gmail.com';
*/

-- 7b. Ver ledger de transacciones recientes:
/*
SELECT
  cl.id,
  cl.transaction_type,
  cl.amount,
  cl.credit_type,
  cl.previous_balance,
  cl.new_balance,
  cl.reference_id,
  cl.notes,
  cl.created_at
FROM credit_ledger cl
WHERE cl.user_id = (
  SELECT id FROM profiles WHERE email_fallback ILIKE 'sira.armas@gmail.com'
)
ORDER BY cl.created_at DESC
LIMIT 15;
*/

-- 7c. Ver si tiene reserva activa de Indoor Cycling:
/*
SELECT
  c.id,
  c.discipline,
  c.date,
  c.class_time,
  c.occupied_spots
FROM classes c
WHERE c.date BETWEEN '2026-04-20' AND '2026-04-21'
  AND c.discipline = 'Indoor Cycling'
  AND c.occupied_spots @> jsonb_build_array(
    jsonb_build_object('userId',
      (SELECT id::text FROM profiles WHERE email_fallback ILIKE 'sira.armas@gmail.com')
    )
  );
*/

-- 7d. REPARACIÓN: Devolver 1 crédito de Indoor Cycling
--     (Ejecutar SOLO si el diagnóstico confirma que NO tiene reserva activa)
/*
SELECT add_credits_by_email(
  'sira.armas@gmail.com',
  1,
  NULL,
  'Reembolso — crédito descontado sin reserva exitosa. 2026-04-20',
  'indoor'
);
*/

-- ============================================================
-- BLOQUE 8: VISTA ADMIN — Tabla de usuarios con créditos
-- Para que Ana y Eduardo puedan ver qué créditos tiene cada quien
-- ============================================================

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
  TO_CHAR(p.created_at, 'DD/MM/YYYY HH24:MI')         AS fecha_registro,
  TO_CHAR(p.updated_at, 'DD/MM/YYYY HH24:MI')         AS ultima_actualizacion,
  -- Última compra
  (
    SELECT cl.created_at
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type IN ('stripe_webhook', 'manual_admin')
      AND cl.amount > 0
    ORDER BY cl.created_at DESC
    LIMIT 1
  )                                                    AS ultima_compra,
  -- Conteo de clases tomadas
  (
    SELECT COUNT(*)
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type = 'class_reservation'
  )                                                    AS clases_tomadas_total
FROM profiles p
ORDER BY p.created_at DESC;

-- Política de acceso: Solo admins (acceso via service_role o función SECURITY DEFINER)
-- Para acceder desde el frontend, crear RPC wrapper:

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
  -- NOTA: Validar que quien llama es admin en el frontend
  -- La función retorna todos los perfiles (solo invocar desde admin UI)
  RETURN QUERY SELECT * FROM admin_users_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;
