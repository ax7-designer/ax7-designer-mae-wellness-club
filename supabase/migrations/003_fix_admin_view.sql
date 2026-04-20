-- ============================================================
-- MAE WELLNESS CLUB — MIGRATION 003
-- Fix: admin_users_credits view (created_at no existe en profiles)
-- Solución: usar updated_at + obtener registro real de auth.users
--           dentro de la función SECURITY DEFINER
-- ============================================================

-- Eliminar vista anterior si existe (fallida en 002)
DROP VIEW IF EXISTS admin_users_credits;

-- Recrear vista con columnas correctas (sin created_at)
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
  -- Última compra
  (
    SELECT cl.created_at
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type IN ('stripe_webhook', 'manual_admin')
      AND cl.amount > 0
    ORDER BY cl.created_at DESC
    LIMIT 1
  )                                                     AS ultima_compra,
  -- Conteo de clases tomadas
  (
    SELECT COUNT(*)
    FROM credit_ledger cl
    WHERE cl.user_id = p.id
      AND cl.transaction_type = 'class_reservation'
  )                                                     AS clases_tomadas_total
FROM profiles p
ORDER BY p.updated_at DESC NULLS LAST;

-- ============================================================
-- NOTA: get_all_users_admin ya no se usa desde la web.
-- El acceso a datos de usuarios se hace via export-users.mjs
-- que incluye la fecha de registro real desde auth.users.
-- Se mantiene la función por si en el futuro se requiere.
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
