import { supabase } from '../shared/supabaseClient.js';

/**
 * Performs a client booking using the reserve_spot_v2 RPC.
 */
export async function bookReservation(classId, userId, spotData) {
    return supabase.rpc('reserve_spot_v2', {
        p_class_id: classId,
        p_user_id: userId,
        p_spot_data: spotData
    });
}

/**
 * Cancels a client booking using the cancel_reservation_v2 RPC.
 */
export async function cancelReservation(classId, userId) {
    return supabase.rpc('cancel_reservation_v2', {
        p_class_id: classId,
        p_user_id: userId,
        p_spot: 0
    });
}

/**
 * Performs an admin-assisted booking using the admin_reserve_spot_v2 RPC.
 */
export async function adminBookReservation(classId, userId, adminId, spotData, deductCredits = true) {
    return supabase.rpc('admin_reserve_spot_v2', {
        p_class_id: classId,
        p_user_id: userId,
        p_admin_id: adminId,
        p_spot_data: spotData,
        p_deduct_credits: deductCredits
    });
}
