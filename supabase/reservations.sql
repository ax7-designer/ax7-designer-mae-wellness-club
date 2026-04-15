-- ============================================================
-- MAE WELLNESS CLUB - ATOMIC RESERVATIONS & UTILS
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Function to Atomic Reservation (Credits + Spot)
CREATE OR REPLACE FUNCTION reserve_spot_v2(
  p_class_id UUID,
  p_user_id UUID,
  p_spot_data JSONB
) RETURNS VOID AS $$
DECLARE
  v_credits INT;
  v_occupied JSONB;
BEGIN
  -- Check user credits
  SELECT credits INTO v_credits FROM profiles WHERE id = p_user_id;
  IF v_credits <= 0 THEN
    RAISE EXCEPTION 'Créditos insuficientes';
  END IF;

  -- Check if spot is taken (Atomic session lock)
  SELECT occupied_spots INTO v_occupied FROM classes WHERE id = p_class_id FOR UPDATE;
  
  -- Logic to check if spot is already in JSONB array
  IF v_occupied @> jsonb_build_array(p_spot_data) THEN
    RAISE EXCEPTION 'El lugar ya está ocupado';
  END IF;

  -- Update credits
  UPDATE profiles SET credits = credits - 1 WHERE id = p_user_id;

  -- Update class spots
  UPDATE classes 
  SET occupied_spots = occupied_spots || p_spot_data
  WHERE id = p_class_id;

END;
$$ LANGUAGE plpgsql;

-- 2. Function to Atomic Cancellation
CREATE OR REPLACE FUNCTION cancel_reservation_v2(
  p_class_id UUID,
  p_user_id UUID,
  p_spot INT
) RETURNS VOID AS $$
BEGIN
  -- Update class spots (removing the user's entry)
  UPDATE classes 
  SET occupied_spots = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(occupied_spots) AS elem
    WHERE (elem->>'userId')::UUID != p_user_id
  )
  WHERE id = p_class_id;

  -- Refund credit
  UPDATE profiles SET credits = credits + 1 WHERE id = p_user_id;

END;
$$ LANGUAGE plpgsql;

-- 3. Function to add credits by email (Admin utility)
CREATE OR REPLACE FUNCTION add_credits_by_email(
  target_email TEXT,
  amount INT
) RETURNS VOID AS $$
BEGIN
  UPDATE profiles 
  SET credits = credits + amount 
  WHERE email_fallback ILIKE target_email;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to add credits by ID (Webhook utility)
CREATE OR REPLACE FUNCTION add_credits_by_id_v2(
  p_user_id UUID,
  p_amount INT
) RETURNS VOID AS $$
BEGIN
  UPDATE profiles 
  SET credits = credits + p_amount 
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;
