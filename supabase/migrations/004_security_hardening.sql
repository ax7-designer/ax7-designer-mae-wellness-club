-- ============================================================
-- MAE WELLNESS CLUB — MIGRATION 004
-- Security Hardening: RLS + Correct Policies
--
-- PREREQUISITO: Haber ejecutado 003_fix_admin_view.sql
--
-- QUÉ HACE:
--   1. Habilita RLS en profiles (política: solo propio registro)
--   2. Revoca acceso REST directo a admin_users_credits
--   3. Habilita RLS en classes (SELECT abierto, write via SECURITY DEFINER)
--   4. Habilita RLS en inactive_days (SELECT abierto, write solo admins)
--   5. Corrige política permisiva de class_attendance
--   6. Refuerza credit_ledger (no INSERT directo desde cliente)
--   7. Añade RPC search_profile_by_email (para búsqueda admin)
--   8. Añade RPC get_class_roster (para panel roster admin)
--   9. Añade columna is_admin a profiles (futuro role-based access)
-- ============================================================

-- ============================================================
-- BLOQUE 1: RLS en profiles
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores si existen
DROP POLICY IF EXISTS "profiles_select_own"   ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own"   ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON profiles;
DROP POLICY IF EXISTS "profiles_delete_none"  ON profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON profiles;

-- SELECT: cada usuario solo ve su propio perfil
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- INSERT: solo puede crear su propio perfil
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE: solo puede modificar su propio perfil
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  TO authenticated
  USING     (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: nadie puede borrar perfiles desde el cliente
-- (las cascadas se hacen desde el panel de Supabase o via service_role)
CREATE POLICY "profiles_delete_none" ON profiles
  FOR DELETE
  TO authenticated
  USING (false);

-- NOTA: service_role siempre bypasea RLS automáticamente en Supabase.
-- Las funciones SECURITY DEFINER (reserve_spot_v2, add_credits_by_email,
-- etc.) también bypasean RLS porque corren como el propietario (postgres).

-- ============================================================
-- BLOQUE 2: Revocar acceso REST a admin_users_credits
-- ============================================================

-- La vista solo debe ser accesible via get_all_users_admin() (SECURITY DEFINER)
-- No via /rest/v1/admin_users_credits directo
REVOKE ALL ON TABLE admin_users_credits FROM anon;
REVOKE ALL ON TABLE admin_users_credits FROM authenticated;
-- service_role sigue teniendo acceso (usado por export-users.mjs)

-- ============================================================
-- BLOQUE 3: RLS en classes
-- ============================================================

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classes_read_all"      ON classes;
DROP POLICY IF EXISTS "classes_write_blocked" ON classes;

-- SELECT: todos pueden ver el horario (incluso sin login)
CREATE POLICY "classes_read_all" ON classes
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT / UPDATE / DELETE: bloqueado desde el cliente.
-- Solo funciones SECURITY DEFINER o service_role pueden modificar clases.
CREATE POLICY "classes_write_service_only" ON classes
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- NOTA IMPORTANTE: Las líneas en script.js que hacen INSERT/DELETE directo
-- en 'classes' (admin crea/borra clases) necesitan ser migradas a RPCs.
-- Por ahora se exceptúan via is_admin column (ver abajo) o service_role key.
-- Añadimos una política temporal para admins mientras se migra el código:

DROP POLICY IF EXISTS "classes_write_admin" ON classes;
CREATE POLICY "classes_write_admin" ON classes
  FOR ALL
  TO authenticated
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- BLOQUE 4: Columna is_admin en profiles
-- (Necesaria para la política de classes_write_admin arriba)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Marcar los admins actuales. REEMPLAZA estos emails con los reales:
-- (Los emails de Ana y Eduardo — los admins del club)
UPDATE profiles
SET is_admin = true
WHERE email_fallback IN (
  'ana@maewellness.com',       -- ← Cambiar al email real de Ana
  'eduardo@maewellness.com'    -- ← Cambiar al email real de Eduardo
);

-- ============================================================
-- BLOQUE 5: RLS en inactive_days
-- ============================================================

ALTER TABLE inactive_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inactive_days_read_all"   ON inactive_days;
DROP POLICY IF EXISTS "inactive_days_write_admin" ON inactive_days;

-- Todos pueden leer los días inactivos (para no mostrar clases esos días)
CREATE POLICY "inactive_days_read_all" ON inactive_days
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Solo admins pueden escribir días inactivos
CREATE POLICY "inactive_days_write_admin" ON inactive_days
  FOR ALL
  TO authenticated
  USING     ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

-- ============================================================
-- BLOQUE 6: Corregir política permisiva de class_attendance
-- ============================================================

-- La política actual "Admins manage attendance" con USING(true) permite
-- que cualquier usuario autenticado lea y escriba asistencias.
DROP POLICY IF EXISTS "Admins manage attendance" ON class_attendance;

-- SELECT: usuarios solo ven su propia asistencia
DROP POLICY IF EXISTS "attendance_select_own"  ON class_attendance;
CREATE POLICY "attendance_select_own" ON class_attendance
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE: solo via la función mark_attendance (SECURITY DEFINER)
-- Bloqueamos INSERT/UPDATE/DELETE directo desde cliente
DROP POLICY IF EXISTS "attendance_write_blocked" ON class_attendance;
CREATE POLICY "attendance_write_blocked" ON class_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ============================================================
-- BLOQUE 7: Reforzar credit_ledger (no INSERT directo)
-- ============================================================

-- Ya tiene: SELECT = solo propio registro
-- Añadir: INSERT directo bloqueado (solo via SECURITY DEFINER functions)
DROP POLICY IF EXISTS "ledger_insert_blocked" ON credit_ledger;
CREATE POLICY "ledger_insert_blocked" ON credit_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ============================================================
-- BLOQUE 8: RPC search_profile_by_email
-- Reemplaza el SELECT directo del admin (línea 429 en script.js)
-- que busca perfiles por email para asignar créditos.
-- ============================================================

CREATE OR REPLACE FUNCTION search_profile_by_email(p_email TEXT)
RETURNS TABLE (
  id                 UUID,
  full_name          TEXT,
  nickname           TEXT,
  email_fallback     TEXT,
  credits_indoor     INT,
  credits_train      INT,
  credits_pilates    INT,
  credits_open       INT,
  credits            INT,
  preferred_discipline TEXT,
  is_admin           BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admins pueden buscar perfiles ajenos
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.full_name, p.nickname, p.email_fallback,
    p.credits_indoor, p.credits_train, p.credits_pilates, p.credits_open,
    p.credits, p.preferred_discipline, p.is_admin
  FROM profiles p
  WHERE p.email_fallback ILIKE p_email
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION search_profile_by_email(TEXT) TO authenticated;

-- ============================================================
-- BLOQUE 9: RPC get_class_roster
-- Reemplaza el SELECT directo de profiles en el roster del admin
-- (línea 1675 en script.js)
-- ============================================================

CREATE OR REPLACE FUNCTION get_class_roster(p_class_id UUID)
RETURNS TABLE (
  user_id      UUID,
  full_name    TEXT,
  nickname     TEXT,
  email        TEXT,
  spot_number  INT,
  credits_left INT,
  status       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admins pueden ver el roster completo
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                             AS user_id,
    p.full_name,
    p.nickname,
    p.email_fallback                                 AS email,
    (elem->>'spot')::INT                             AS spot_number,
    p.credits                                        AS credits_left,
    COALESCE(ca.status, 'reserved')                 AS status
  FROM classes c,
       jsonb_array_elements(c.occupied_spots) AS elem
  JOIN profiles p
    ON p.id = (elem->>'userId')::UUID
  LEFT JOIN class_attendance ca
    ON ca.class_id = c.id AND ca.user_id = p.id
  WHERE c.id = p_class_id
  ORDER BY spot_number;
END;
$$;

GRANT EXECUTE ON FUNCTION get_class_roster(UUID) TO authenticated;

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY['profiles', 'classes', 'credit_ledger', 'class_attendance', 'inactive_days'];
  v_table  TEXT;
  v_rls    BOOLEAN;
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    SELECT relrowsecurity INTO v_rls
    FROM pg_class
    WHERE relname = v_table AND relnamespace = 'public'::regnamespace;

    IF v_rls THEN
      RAISE NOTICE '✅ RLS activo en: %', v_table;
    ELSE
      RAISE NOTICE '❌ RLS no activo en: %', v_table;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Admins registrados:';
  FOR v_table IN
    SELECT email_fallback FROM profiles WHERE is_admin = true
  LOOP
    RAISE NOTICE '  → %', v_table;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANTE: Actualiza los emails de admin en el BLOQUE 4 si aún son placeholders.';
END;
$$;
