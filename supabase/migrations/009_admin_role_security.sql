-- Migration: 009_admin_role_security
-- Adds 'role' column to profiles, initializes admin roles, secures admin RPCs, and adds run_tests().

-- 1. Add role column to profiles with constraints
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client'
  CHECK (role IN ('client', 'admin'));

-- 2. Initialize current admins in the database
UPDATE public.profiles
SET role = 'admin'
WHERE email_fallback IN ('jesuscomtreras.666@gmail.com', 'guemesana12@gmail.com', 'alexis.septem@gmail.com');

-- 3. Secure add_credits_by_email RPC
DROP FUNCTION IF EXISTS add_credits_by_email(TEXT, INT, UUID, TEXT, TEXT);
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
  v_admin_id     UUID;
BEGIN
  -- Security check: assert executor is admin
  IF auth.role() != 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado. Se requieren permisos de administrador.';
  END IF;

  IF p_credit_type NOT IN ('indoor', 'train', 'pilates', 'open') THEN
    RAISE EXCEPTION 'Tipo de crédito inválido: %. Usa: indoor | train | pilates | open', p_credit_type;
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'La cantidad de créditos debe ser mayor a 0.';
  END IF;

  -- Use session user ID for admin audit trail if available
  v_admin_id := COALESCE(auth.uid(), p_admin_id);

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
    v_target_id, v_admin_id, amount, 'manual_admin',
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

-- 4. Secure admin_reserve_spot_v2 RPC
DROP FUNCTION IF EXISTS admin_reserve_spot_v2(UUID, UUID, UUID, JSONB, BOOLEAN);
CREATE OR REPLACE FUNCTION admin_reserve_spot_v2(
  p_class_id       UUID,
  p_user_id        UUID,
  p_admin_id       UUID,
  p_spot_data      JSONB,
  p_deduct_credits BOOLEAN DEFAULT TRUE
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
  v_admin_email     TEXT;
  v_actual_admin_id UUID;
BEGIN
  -- Security check: assert executor is admin
  IF auth.role() != 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado. Se requieren permisos de administrador.';
  END IF;

  v_actual_admin_id := COALESCE(auth.uid(), p_admin_id);

  -- Verify the admin profile exists
  SELECT email_fallback INTO v_admin_email
  FROM profiles WHERE id = v_actual_admin_id;
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
      p_user_id, v_actual_admin_id, -1, 'class_reservation', v_old_credits, v_new_credits,
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

-- 5. Secure mark_attendance RPC
DROP FUNCTION IF EXISTS mark_attendance(UUID, UUID, TEXT, UUID);
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
  v_actual_admin_id UUID;
BEGIN
  -- Security check: assert executor is admin
  IF auth.role() != 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado. Se requieren permisos de administrador.';
  END IF;

  IF p_status NOT IN ('attended', 'no_show', 'reserved') THEN
    RAISE EXCEPTION 'Estado inválido. Usa: attended | no_show | reserved';
  END IF;

  v_actual_admin_id := COALESCE(auth.uid(), p_admin_id);

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
    v_actual_admin_id
  )
  ON CONFLICT (class_id, user_id) DO UPDATE
  SET
    status        = EXCLUDED.status,
    checked_in_at = EXCLUDED.checked_in_at,
    checked_in_by = EXCLUDED.checked_in_by;

END;
$$;

-- 6. Secure get_all_users_admin RPC
DROP FUNCTION IF EXISTS get_all_users_admin();
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
  -- Security check: assert executor is admin
  IF auth.role() != 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado. Se requieren permisos de administrador.';
  END IF;

  RETURN QUERY SELECT * FROM admin_users_credits;
END;
$$;

-- 7. Add run_tests() RPC to run integration tests
DROP FUNCTION IF EXISTS run_tests();
CREATE OR REPLACE FUNCTION run_tests()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_admin_id UUID := '00000000-0000-0000-0000-000000000002';
  
  -- Multiple class IDs to prevent 30s ledger idempotency block
  v_class_id UUID := '00000000-0000-0000-0000-000000000003';
  v_class_full_id UUID := '00000000-0000-0000-0000-000000000004';
  v_class_id_4 UUID := '00000000-0000-0000-0000-000000000005';
  v_class_id_6 UUID := '00000000-0000-0000-0000-000000000006';
  v_class_id_7 UUID := '00000000-0000-0000-0000-000000000007';
  v_class_id_9 UUID := '00000000-0000-0000-0000-000000000009';
  
  v_credits_before INT;
  v_credits_after INT;
  v_res_count INT;
BEGIN
  -- Security check: assert executor is admin
  IF auth.role() != 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado. Se requieren permisos de administrador.';
  END IF;

  -- Run integration test block
  -- Setup mock data
  INSERT INTO auth.users (id, email, is_sso_user, is_anonymous, aud, role)
  VALUES 
    (v_user_id, 'test_user@mae.com', false, false, 'authenticated', 'authenticated'),
    (v_admin_id, 'test_admin@mae.com', false, false, 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email_fallback, credits_indoor, credits_train, credits_pilates, credits_open, role)
  VALUES
    (v_user_id, 'test_user@mae.com', 1, 0, 0, 0, 'client'),
    (v_admin_id, 'test_admin@mae.com', 0, 0, 0, 0, 'admin')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.classes (id, date, discipline, coach_name, capacity, occupied_spots, class_time)
  VALUES
    (v_class_id, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '10:00'),
    (v_class_full_id, '2026-06-05', 'Indoor Cycling', 'Test Coach', 1, '[{"spot": 1, "userId": "00000000-0000-0000-0000-999999999999", "userName": "Existing User"}]'::jsonb, '11:00'),
    (v_class_id_4, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '12:00'),
    (v_class_id_6, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '13:00'),
    (v_class_id_7, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '14:00'),
    (v_class_id_9, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '15:00')
  ON CONFLICT (id) DO NOTHING;

  -- 1. Valid credit booking
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  PERFORM reserve_spot_v2(v_class_id, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
  SELECT credits_indoor INTO v_credits_after FROM public.profiles WHERE id = v_user_id;
  IF v_credits_after != 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected credits_indoor to be 0, got %', v_credits_after;
  END IF;

  -- 2. Double booking
  BEGIN
    PERFORM reserve_spot_v2(v_class_id, v_user_id, '{"spot": 2, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 2 FAILED: Expected double booking to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Ya tienes una reserva%' THEN RAISE; END IF;
  END;

  -- 3. Cancellation refunds
  PERFORM cancel_reservation_v2(v_class_id, v_user_id, 1);
  SELECT credits_indoor INTO v_credits_after FROM public.profiles WHERE id = v_user_id;
  IF v_credits_after != 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected credits_indoor to be 1, got %', v_credits_after;
  END IF;

  -- 4. Booking without credits
  UPDATE public.profiles SET credits_indoor = 0 WHERE id = v_user_id;
  BEGIN
    PERFORM reserve_spot_v2(v_class_id_4, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 4 FAILED: Expected booking without credits to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Sin créditos%' AND SQLERRM NOT LIKE '%No tienes clases disponibles%' THEN RAISE; END IF;
  END;

  -- 5. Book full class
  UPDATE public.profiles SET credits_indoor = 1 WHERE id = v_user_id;
  BEGIN
    PERFORM reserve_spot_v2(v_class_full_id, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 5 FAILED: Expected spot occupied to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%El lugar ya está ocupado%' THEN RAISE; END IF;
  END;

  -- 6. Expired credit booking
  UPDATE public.profiles SET credits_expiration_date = NOW() - INTERVAL '1 day' WHERE id = v_user_id;
  BEGIN
    PERFORM reserve_spot_v2(v_class_id_6, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 6 FAILED: Expected expired credit booking to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Tus créditos han expirado%' THEN RAISE; END IF;
  END;
  UPDATE public.profiles SET credits_expiration_date = NULL WHERE id = v_user_id;

  -- 7. Admin booking
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  UPDATE public.profiles SET credits_indoor = 0 WHERE id = v_user_id;
  BEGIN
    PERFORM admin_reserve_spot_v2(v_class_id_7, v_user_id, v_admin_id, '{"spot": 1}', true);
    RAISE EXCEPTION 'TEST 7a FAILED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%El cliente no tiene créditos%' THEN RAISE; END IF;
  END;
  PERFORM admin_reserve_spot_v2(v_class_id_7, v_user_id, v_admin_id, '{"spot": 1}', false);

  -- 8. Webhook idempotency
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  PERFORM add_credits_by_id_v2(v_user_id, 5, 'stripe_ref_test_999', 'indoor');
  BEGIN
    PERFORM add_credits_by_id_v2(v_user_id, 5, 'stripe_ref_test_999', 'indoor');
    RAISE EXCEPTION 'TEST 8 FAILED: Expected duplicate webhook check to trigger';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DUPLICATE_WEBHOOK%' THEN RAISE; END IF;
  END;

  -- 9. Negative tests (unprivileged checks)
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  BEGIN PERFORM get_all_users_admin(); RAISE EXCEPTION 'TEST 9a FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Acceso denegado%' THEN RAISE; END IF; END;
  BEGIN PERFORM add_credits_by_email('test_user@mae.com', 5, v_user_id); RAISE EXCEPTION 'TEST 9b FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Acceso denegado%' THEN RAISE; END IF; END;
  BEGIN PERFORM mark_attendance(v_class_id_9, v_user_id, 'attended', v_user_id); RAISE EXCEPTION 'TEST 9c FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Acceso denegado%' THEN RAISE; END IF; END;
  BEGIN PERFORM admin_reserve_spot_v2(v_class_id_9, v_user_id, v_user_id, '{"spot": 1}', false); RAISE EXCEPTION 'TEST 9d FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Acceso denegado%' THEN RAISE; END IF; END;

  -- Raise exception to rollback mock data
  RAISE EXCEPTION 'ROLLBACK';

EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'ROLLBACK' THEN
      RETURN 'SUCCESS: All 9 test cases passed successfully.';
    ELSE
      RETURN 'FAIL: ' || SQLERRM;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION run_tests() TO authenticated;
