-- ============================================================
-- MAE WELLNESS CLUB — EMERGENCY SQL
-- Fix for cpavonr@gmail.com — Pilates reservation lost
-- Run AFTER running 001_credit_ledger_and_fixes.sql
-- ============================================================

-- STEP 1: Find the user and class records. Review output before proceeding.
-- ============================================================
SELECT
  p.id           AS user_id,
  p.email_fallback,
  p.credits      AS current_credits,
  p.full_name,
  p.nickname
FROM profiles p
WHERE p.email_fallback ILIKE 'cpavonr@gmail.com';

-- STEP 2: Find the Pilates class for Monday April 21, 2026 at 8:00 AM
-- ============================================================
SELECT
  c.id           AS class_id,
  c.date,
  c.discipline,
  c.capacity,
  c.note,
  jsonb_array_length(c.occupied_spots) AS spots_taken,
  c.occupied_spots
FROM classes c
WHERE c.date = '2026-04-21'
  AND c.discipline = 'Pilates'
  AND c.note LIKE '[T:08:00]%';

-- ============================================================
-- STEP 3: Execute the repair.
-- Replace the UUIDs with the actual values from steps 1 and 2.
-- DO NOT run this until you have confirmed both UUIDs above.
-- ============================================================

DO $$
DECLARE
  -- !! REPLACE THESE WITH REAL VALUES FROM STEPS 1 & 2 !!
  v_class_id UUID := 'PASTE-CLASS-UUID-HERE';
  v_user_id  UUID := 'PASTE-USER-UUID-HERE';
  v_spot_number INT := 1;  -- Adjust to the spot number the user intended
  v_display_name TEXT := 'cpavon'; -- Adjust to the user's actual displayName
  --
  v_already_in BOOLEAN;
  v_occupied   JSONB;
BEGIN
  -- Safety: Verify user exists in profiles
  PERFORM 1 FROM profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: User % not found in profiles.', v_user_id;
  END IF;

  -- Safety: Verify class exists
  SELECT occupied_spots INTO v_occupied FROM classes WHERE id = v_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: Class % not found.', v_class_id;
  END IF;

  -- Safety: Verify the user is NOT already in occupied_spots
  v_already_in := v_occupied @> jsonb_build_array(
    jsonb_build_object('userId', v_user_id::text)
  );
  IF v_already_in THEN
    RAISE EXCEPTION 'ABORT: User is already in occupied_spots. No correction needed.';
  END IF;

  -- Inject the user into occupied_spots WITHOUT touching credits
  UPDATE classes
  SET occupied_spots = occupied_spots || jsonb_build_array(
    jsonb_build_object(
      'spot',        v_spot_number,
      'userId',      v_user_id::text,
      'displayName', v_display_name
    )
  )
  WHERE id = v_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: Update failed. Verify the class UUID.';
  END IF;

  -- Record the correction in the ledger for full audit trail
  -- We set amount=0 because no credit is being deducted (it was already deducted)
  -- This creates a forensic record of the emergency correction
  INSERT INTO credit_ledger (
    user_id, admin_id, amount, transaction_type,
    previous_balance, new_balance,
    reference_id, notes
  )
  SELECT
    v_user_id,
    NULL,  -- No specific admin UUID for this emergency fix
    0,     -- No credit movement (already deducted)
    'class_reservation',
    credits,   -- Current balance
    credits,   -- Same balance (no movement)
    v_class_id::text,
    'EMERGENCY FIX: Reservation manually restored after atomicity failure. Credit was previously deducted correctly.'
  FROM profiles WHERE id = v_user_id;

  RAISE NOTICE 'SUCCESS: User % inserted at spot #% in class %. No credit deducted.', 
    v_user_id, v_spot_number, v_class_id;
END;
$$;

-- STEP 4: Verify the fix was applied correctly
-- ============================================================
SELECT
  c.date,
  c.discipline,
  c.capacity,
  jsonb_array_length(c.occupied_spots) AS spots_now_taken,
  c.occupied_spots
FROM classes c
WHERE c.date = '2026-04-21'
  AND c.discipline = 'Pilates'
  AND c.note LIKE '[T:08:00]%';
