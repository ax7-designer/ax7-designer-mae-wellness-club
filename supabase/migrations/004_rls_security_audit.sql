-- ============================================================
-- MAE WELLNESS CLUB — MIGRATION 004
-- Auditoría de Seguridad & ROW LEVEL SECURITY (RLS)
-- ============================================================
-- ============================================================
-- 1. TABLA 'profiles'
-- Habilitar RLS y bloquear modificación directa de créditos
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- 1a. Políticas: Leer y escribir SOLO sobre tu propio perfil
DROP POLICY IF EXISTS "Ver perfil propio" ON profiles;
CREATE POLICY "Ver perfil propio" ON profiles FOR
SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "Insertar perfil propio" ON profiles;
CREATE POLICY "Insertar perfil propio" ON profiles FOR
INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "Actualizar perfil propio" ON profiles;
CREATE POLICY "Actualizar perfil propio" ON profiles FOR
UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- 1b. Bloqueo de Columnas Críticas (Los usuarios NUNCA pueden meter mano aquí directamente)
-- Para sumar o restar, deben usar funciones como reserve_spot_v2 o el webhook (que omiten estas reglas)
REVOKE
UPDATE (
    credits,
    credits_open,
    credits_indoor,
    credits_train,
    credits_pilates
  ) ON TABLE profiles
FROM PUBLIC,
  authenticated,
  anon;
REVOKE
INSERT (
    credits,
    credits_open,
    credits_indoor,
    credits_train,
    credits_pilates
  ) ON TABLE profiles
FROM PUBLIC,
  authenticated,
  anon;
-- ============================================================
-- 2. TABLA 'classes'
-- Solo lectura para usuarios; modificaciones bloqueadas
-- ============================================================
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
-- 2a. Política: Cualquier usuario autenticado puede visualizar el calendario
DROP POLICY IF EXISTS "Todos pueden leer clases" ON classes;
CREATE POLICY "Todos pueden leer clases" ON classes FOR
SELECT TO authenticated USING (true);
-- (Al no definir políticas de INSERT, UPDATE o DELETE, quedan implícitamente rechazadas)
-- La función 'reserve_spot_v2' usa SECURITY DEFINER y puede saltarse esta barrera.
-- ============================================================
-- 3. VISTA 'admin_users_credits'
-- Resolver warning de SECURITY DEFINER en vistas
-- ============================================================
DROP VIEW IF EXISTS admin_users_credits CASCADE;
-- Recrear con context 'security_invoker' para cumplir normativas de PG15+
CREATE OR REPLACE VIEW admin_users_credits WITH (security_invoker = on) AS
SELECT p.id,
  p.full_name AS nombre,
  p.nickname AS apodo,
  p.email_fallback AS email,
  p.credits_indoor AS creditos_indoor,
  p.credits_train AS creditos_train,
  p.credits_pilates AS creditos_pilates,
  p.credits_open AS creditos_vip,
  p.credits AS total_creditos,
  p.preferred_discipline AS disciplina_preferida,
  TO_CHAR(p.updated_at, 'DD/MM/YYYY HH24:MI') AS ultima_actualizacion,
  (
    SELECT cl.created_at
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type IN ('stripe_webhook', 'manual_admin')
      AND cl.amount > 0
    ORDER BY cl.created_at DESC
    LIMIT 1
  ) AS ultima_compra,
  (
    SELECT COUNT(*)
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type = 'class_reservation'
  ) AS clases_tomadas_total
FROM profiles p
ORDER BY p.updated_at DESC NULLS LAST;
-- Restaurar la función (que fue eliminada por el CASCADE anterior si aplicaba)
CREATE OR REPLACE FUNCTION get_all_users_admin() RETURNS TABLE (
    id UUID,
    nombre TEXT,
    apodo TEXT,
    email TEXT,
    creditos_indoor INT,
    creditos_train INT,
    creditos_pilates INT,
    creditos_vip INT,
    total_creditos INT,
    disciplina_preferida TEXT,
    ultima_actualizacion TEXT,
    ultima_compra TIMESTAMPTZ,
    clases_tomadas_total BIGINT
  ) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ BEGIN RETURN QUERY
SELECT *
FROM admin_users_credits;
END;
$$;
GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;
-- ============================================================
-- 4. BÚSQUEDA DE USUARIOS ADMIN (RPC Bypassing RLS)
-- Como cerramos la tabla profiles, un Admin ya no puede buscar el email
-- para asignar créditos manuales usando "SELECT * FROM profiles WHERE email=...". 
-- Por ende creamos esta pequeña función de escape regulada.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_search_user(p_email TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER -- Excepción estricta controlada
SET search_path = public AS $$
DECLARE v_profile RECORD;
BEGIN -- Validar entrada vacía
IF p_email IS NULL
OR TRIM(p_email) = '' THEN RETURN NULL;
END IF;
SELECT id,
  email_fallback,
  credits,
  full_name,
  nickname,
  avatar,
  updated_at INTO v_profile
FROM profiles
WHERE email_fallback ILIKE p_email
LIMIT 1;
IF NOT FOUND THEN RETURN NULL;
END IF;
RETURN jsonb_build_object(
  'id',
  v_profile.id,
  'email_fallback',
  v_profile.email_fallback,
  'credits',
  v_profile.credits,
  'full_name',
  v_profile.full_name,
  'nickname',
  v_profile.nickname,
  'avatar',
  v_profile.avatar,
  'updated_at',
  v_profile.updated_at
);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_search_user(TEXT) TO authenticated;