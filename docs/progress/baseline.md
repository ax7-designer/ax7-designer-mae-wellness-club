# Baseline Audit - MAE Wellness Club

Date: 2026-06-03
Initial Score: 52/100
Build Status: passing

---

## 1. Build and Assets Size

- **Build Command:** `npm run build` (passing)
- **Monolithic Script (Source):** [script.js](file:///d:/MAE-Project/fitness-club/script.js) — 132,793 bytes (~132.8 kB), 2,649 lines.
- **Monolithic Script (Vite Bundled):** `dist/assets/script-*.js` — 264.65 kB (includes `@supabase/supabase-js`, `stripe`, etc.).
- **Styles CSS (Source):** [styles.css](file:///d:/MAE-Project/fitness-club/styles.css) — 66,562 bytes (~66.6 kB).
- **Styles CSS (Vite Bundled):** `dist/assets/styles-*.css` — 46.04 kB.

---

## 2. Active Database RPCs

The following RPCs exist in Supabase and run as `SECURITY DEFINER`:

1. **`reserve_spot_v2(p_class_id, p_user_id, p_spot_data)`**
   - Deducts credit based on discipline priorities: specific discipline credit -> VIP open credit.
   - Logs to `credit_ledger`.
2. **`cancel_reservation_v2(p_class_id, p_user_id, p_spot)`**
   - Removes spot, refunds credit back to the source type (by querying ledger, falling back to discipline).
3. **`add_credits_by_email(target_email, amount, p_admin_id, p_notes, p_credit_type)`**
   - Admin tool to add credits. Sets/extends 30-day expiration date. Logs to `credit_ledger`.
4. **`add_credits_by_id_v2(p_user_id, p_amount, p_reference_id, p_credit_type)`**
   - Stripe webhook version. Idempotent check on `reference_id` (rejects duplicates). Sets/extends 30-day expiration.
5. **`admin_reserve_spot_v2(p_class_id, p_user_id, p_admin_id, p_spot_data, p_deduct_credits)`**
   - Allows booking client spots directly, optionally bypassing credit deduction.
6. **`mark_attendance(p_class_id, p_user_id, p_status, p_admin_id)`**
   - Marks a client as `attended`, `no_show`, or `reserved`.
7. **`get_all_users_admin()`**
   - Returns details of all registered users and their current credit balances.
8. **`retry_failed_webhook(p_event_id)`**
   - Retries failed Stripe webhook payouts from `stripe_webhook_events`.

---

## 3. Vulnerability Audit (Open Risks)

### 🔴 Critical: Visual-Only Admin Gates (Server Bypass)
- **Problem:** Frontend client-side `ADMIN_EMAILS` array:
  ```javascript
  const ADMIN_EMAILS = ['jesuscomtreras.666@gmail.com', 'guemesana12@gmail.com', 'alexis.septem@gmail.com'];
  function isAdmin(user) { return user && ADMIN_EMAILS.includes(user.email); }
  ```
  This is the only check protecting the Admin UI dashboard. However, all admin RPCs (`add_credits_by_email`, `admin_reserve_spot_v2`, `mark_attendance`, `get_all_users_admin`) run as `SECURITY DEFINER` and are granted to the public/authenticated role.
- **Risk:** Any logged-in user can execute these RPC functions directly from their browser console or PostgREST API client, granting themselves infinite credits, booking any class, modifying other users' attendance, or leaking the entire customer database.

### 🟡 High: Full User Directory Leak via `get_all_users_admin`
- **Problem:** `get_all_users_admin()` returns all users' names, emails, and balances, and is granted to `authenticated`.
- **Risk:** Any logged-in user can fetch the full client list.

### 🟡 Medium: Secrets Exposure Risk
- **Problem:** The local `.env` contains live production credentials (`sk_live_...`) with no `.env.example` template.

### 🟡 Medium: Lack of Testing Verification
- **Problem:** No automated integration test suite exists. Changes to RPCs are tested manually, running risk of regressions in transaction logic.
