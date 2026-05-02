-- Función para eliminar reservas de usuarios eliminados
CREATE OR REPLACE FUNCTION remove_deleted_user_reservations()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE classes
    SET occupied_spots = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(occupied_spots) AS elem
        WHERE (elem->>'userId') != OLD.id::text
    )
    WHERE occupied_spots @> jsonb_build_array(jsonb_build_object('userId', OLD.id::text));
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger en la tabla profiles
DROP TRIGGER IF EXISTS cleanup_reservations_on_profile_delete ON profiles;
CREATE TRIGGER cleanup_reservations_on_profile_delete
AFTER DELETE ON profiles
FOR EACH ROW
EXECUTE FUNCTION remove_deleted_user_reservations();
