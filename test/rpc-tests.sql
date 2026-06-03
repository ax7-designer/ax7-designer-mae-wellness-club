-- MAE Wellness Club RPC Integration Test Suite
-- Runs all test cases inside a transaction block and rolls back to leave no trace.
-- Execute this using Supabase SQL Editor or automated CLI.

DO $$
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
  RAISE NOTICE 'Starting MAE RPC tests...';

  -- ============================================================
  -- SETUP
  -- ============================================================
  -- Create mock auth users
  INSERT INTO auth.users (id, email, is_sso_user, is_anonymous, aud, role)
  VALUES 
    (v_user_id, 'test_user@mae.com', false, false, 'authenticated', 'authenticated'),
    (v_admin_id, 'test_admin@mae.com', false, false, 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- Create profiles
  INSERT INTO public.profiles (id, email_fallback, credits_indoor, credits_train, credits_pilates, credits_open, role)
  VALUES
    (v_user_id, 'test_user@mae.com', 1, 0, 0, 0, 'client'),
    (v_admin_id, 'test_admin@mae.com', 0, 0, 0, 0, 'admin')
  ON CONFLICT (id) DO NOTHING;

  -- Create classes
  INSERT INTO public.classes (id, date, discipline, coach_name, capacity, occupied_spots, class_time)
  VALUES
    (v_class_id, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '10:00'),
    (v_class_full_id, '2026-06-05', 'Indoor Cycling', 'Test Coach', 1, '[{"spot": 1, "userId": "00000000-0000-0000-0000-999999999999", "userName": "Existing User"}]'::jsonb, '11:00'),
    (v_class_id_4, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '12:00'),
    (v_class_id_6, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '13:00'),
    (v_class_id_7, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '14:00'),
    (v_class_id_9, '2026-06-05', 'Indoor Cycling', 'Test Coach', 11, '[]'::jsonb, '15:00')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- TEST CASE 1: Reserve spot with valid credits (deducts 1)
  -- ============================================================
  RAISE NOTICE 'Running Test 1: Reserve spot with valid credits...';
  -- Mock user claims
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);

  -- Perform reservation
  PERFORM reserve_spot_v2(v_class_id, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);

  -- Verify credit is deducted
  SELECT credits_indoor INTO v_credits_after FROM public.profiles WHERE id = v_user_id;
  IF v_credits_after != 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected credits_indoor to be 0, got %', v_credits_after;
  END IF;

  -- Verify class occupied_spots has user
  SELECT jsonb_array_length(occupied_spots) INTO v_res_count FROM public.classes WHERE id = v_class_id;
  IF v_res_count != 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected occupied_spots count to be 1, got %', v_res_count;
  END IF;

  -- ============================================================
  -- TEST CASE 2: Reserve twice does not deduct double (fails)
  -- ============================================================
  RAISE NOTICE 'Running Test 2: Double reservation prevention...';
  BEGIN
    PERFORM reserve_spot_v2(v_class_id, v_user_id, '{"spot": 2, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 2 FAILED: Expected double booking to fail, but it succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Ya tienes una reserva%' THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Expected double booking error, got: %', SQLERRM;
      END IF;
  END;

  -- ============================================================
  -- TEST CASE 3: Cancel reservation returns credit of correct type
  -- ============================================================
  RAISE NOTICE 'Running Test 3: Cancel reservation refunds correctly...';
  PERFORM cancel_reservation_v2(v_class_id, v_user_id, 1);

  -- Verify credit is refunded to indoor
  SELECT credits_indoor INTO v_credits_after FROM public.profiles WHERE id = v_user_id;
  IF v_credits_after != 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected credits_indoor to be 1, got %', v_credits_after;
  END IF;

  -- Verify class occupied_spots is empty
  SELECT jsonb_array_length(occupied_spots) INTO v_res_count FROM public.classes WHERE id = v_class_id;
  IF v_res_count != 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected occupied_spots count to be 0, got %', v_res_count;
  END IF;

  -- ============================================================
  -- TEST CASE 4: Reserve without credits fails
  -- ============================================================
  RAISE NOTICE 'Running Test 4: Reserve without credits fails...';
  -- Set credits to 0
  UPDATE public.profiles SET credits_indoor = 0 WHERE id = v_user_id;

  BEGIN
    PERFORM reserve_spot_v2(v_class_id_4, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 4 FAILED: Expected reservation without credits to fail, but it succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Sin créditos%' AND SQLERRM NOT LIKE '%No tienes clases disponibles%' THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Expected credit insufficient error, got: %', SQLERRM;
      END IF;
  END;

  -- ============================================================
  -- TEST CASE 5: Reserve class full fails
  -- ============================================================
  RAISE NOTICE 'Running Test 5: Reserve full class fails...';
  -- Give user credits
  UPDATE public.profiles SET credits_indoor = 1 WHERE id = v_user_id;

  BEGIN
    PERFORM reserve_spot_v2(v_class_full_id, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 5 FAILED: Expected booking a full class/spot to fail, but it succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%El lugar ya está ocupado%' THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Expected spot occupied error, got: %', SQLERRM;
      END IF;
  END;

  -- ============================================================
  -- TEST CASE 6: Expired credit reservation fails
  -- ============================================================
  RAISE NOTICE 'Running Test 6: Expired credits booking fails...';
  -- Set expiration to yesterday
  UPDATE public.profiles SET credits_expiration_date = NOW() - INTERVAL '1 day' WHERE id = v_user_id;

  BEGIN
    PERFORM reserve_spot_v2(v_class_id_6, v_user_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb);
    RAISE EXCEPTION 'TEST 6 FAILED: Expected reservation with expired credits to fail, but it succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Tus créditos han expirado%' THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Expected credits expired error, got: %', SQLERRM;
      END IF;
  END;

  -- Restore expiration date
  UPDATE public.profiles SET credits_expiration_date = NULL WHERE id = v_user_id;

  -- ============================================================
  -- TEST CASE 7: Admin reserves for client
  -- ============================================================
  RAISE NOTICE 'Running Test 7: Admin booking actions...';
  -- Mock admin claims
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  -- 7a. With credit deduction (fails since client has 0 indoor credits)
  UPDATE public.profiles SET credits_indoor = 0 WHERE id = v_user_id;
  BEGIN
    PERFORM admin_reserve_spot_v2(v_class_id_7, v_user_id, v_admin_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb, true);
    RAISE EXCEPTION 'TEST 7a FAILED: Expected admin booking with deduction to fail for 0 credits client, but succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%El cliente no tiene créditos%' THEN
        RAISE EXCEPTION 'TEST 7a FAILED: Expected credits error, got: %', SQLERRM;
      END IF;
  END;

  -- 7b. Without credit deduction (succeeds even with 0 credits!)
  PERFORM admin_reserve_spot_v2(v_class_id_7, v_user_id, v_admin_id, '{"spot": 1, "userId": "00000000-0000-0000-0000-000000000001", "userName": "Test User"}'::jsonb, false);
  
  SELECT jsonb_array_length(occupied_spots) INTO v_res_count FROM public.classes WHERE id = v_class_id_7;
  IF v_res_count != 1 THEN
    RAISE EXCEPTION 'TEST 7b FAILED: Expected occupied_spots to be 1 after admin free reservation, got %', v_res_count;
  END IF;

  -- Cleanup class spots for subsequent tests
  UPDATE public.classes SET occupied_spots = '[]'::jsonb WHERE id = v_class_id_7;

  -- ============================================================
  -- TEST CASE 8: Stripe Webhook idempotency (rejects duplicates)
  -- ============================================================
  RAISE NOTICE 'Running Test 8: Stripe webhook idempotency...';
  -- Mock service_role
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  
  -- Add credit via stripe webhook first time (should succeed)
  PERFORM add_credits_by_id_v2(v_user_id, 5, 'stripe_ref_123', 'indoor');

  SELECT credits_indoor INTO v_credits_after FROM public.profiles WHERE id = v_user_id;
  IF v_credits_after != 5 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Expected credits_indoor to be 5, got %', v_credits_after;
  END IF;

  -- Add same credit with same reference_id (should fail)
  BEGIN
    PERFORM add_credits_by_id_v2(v_user_id, 5, 'stripe_ref_123', 'indoor');
    RAISE EXCEPTION 'TEST 8 FAILED: Expected duplicate Stripe webhook to fail, but it succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%DUPLICATE_WEBHOOK%' THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Expected DUPLICATE_WEBHOOK error, got: %', SQLERRM;
      END IF;
  END;

  -- ============================================================
  -- TEST CASE 9: Negative Tests: normal user cannot call admin actions
  -- ============================================================
  RAISE NOTICE 'Running Test 9: Unprivileged admin access rejection...';
  -- Mock user claims
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);

  -- 9a. Normal user cannot search users
  BEGIN
    PERFORM get_all_users_admin();
    RAISE EXCEPTION 'TEST 9a FAILED: Expected get_all_users_admin to fail for client, but succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Acceso denegado%' THEN
        RAISE EXCEPTION 'TEST 9a FAILED: Expected Acceso denegado, got: %', SQLERRM;
      END IF;
  END;

  -- 9b. Normal user cannot add credits
  BEGIN
    PERFORM add_credits_by_email('test_user@mae.com', 5, v_user_id, 'Hack attempt', 'open');
    RAISE EXCEPTION 'TEST 9b FAILED: Expected add_credits_by_email to fail for client, but succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Acceso denegado%' THEN
        RAISE EXCEPTION 'TEST 9b FAILED: Expected Acceso denegado, got: %', SQLERRM;
      END IF;
  END;

  -- 9c. Normal user cannot mark attendance
  BEGIN
    PERFORM mark_attendance(v_class_id_9, v_user_id, 'attended', v_user_id);
    RAISE EXCEPTION 'TEST 9c FAILED: Expected mark_attendance to fail for client, but succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Acceso denegado%' THEN
        RAISE EXCEPTION 'TEST 9c FAILED: Expected Acceso denegado, got: %', SQLERRM;
      END IF;
  END;

  -- 9d. Normal user cannot reserve by client
  BEGIN
    PERFORM admin_reserve_spot_v2(v_class_id_9, v_user_id, v_user_id, '{"spot": 1}'::jsonb, false);
    RAISE EXCEPTION 'TEST 9d FAILED: Expected admin_reserve_spot_v2 to fail for client, but succeeded.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Acceso denegado%' THEN
        RAISE EXCEPTION 'TEST 9d FAILED: Expected Acceso denegado, got: %', SQLERRM;
      END IF;
  END;

  -- ROLLBACK TRANSACTION to leave database clean!
  RAISE EXCEPTION 'ALL TESTS PASSED SUCCESSFULLY. ROLLING BACK TRANSACTION FOR CLEANUP.';

EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'ALL TESTS PASSED SUCCESSFULLY. ROLLING BACK TRANSACTION FOR CLEANUP.' THEN
      RAISE NOTICE '%', SQLERRM;
    ELSE
      RAISE;
    END IF;
END $$;
