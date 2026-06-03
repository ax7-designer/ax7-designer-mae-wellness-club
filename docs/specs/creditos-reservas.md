# Specification: Credits and Reservations Logic

This document specifies the exact business rules, credit consumption priorities, expiration rules, error handling, and authorization permissions for the MAE Wellness Club booking system.

---

## 1. Credit Types and Consumption Priorities

MAE supports four credit categories stored in `public.profiles`:
1. `credits_indoor`: Specifically for **Indoor Cycling** classes.
2. `credits_pilates`: Used for **Pilates** and **Train** classes.
3. `credits_train`: Specifically for **Train** classes assigned manually.
4. `credits_open`: VIP wildcard credits that can book **any** discipline.

### Booking Consumption Flow
When a user books a spot, the system locks their profile and checks their balances. It consumes credits in the following order:

* **Indoor Cycling Class:**
  1. `credits_indoor`
  2. `credits_open`
  3. *Error: Insufficient credits*

* **Train Class:**
  1. `credits_train`
  2. `credits_pilates` (shared pool)
  3. `credits_open`
  4. *Error: Insufficient credits*

* **Pilates Class:**
  1. `credits_pilates` (shared pool)
  2. `credits_train`
  3. `credits_open`
  4. *Error: Insufficient credits*

* **Other Disciplines:**
  1. `credits_open`
  2. *Error: Insufficient credits*

---

## 2. Cancellation and Refunds

When a reservation is cancelled:
1. The user's spot is removed from the class `occupied_spots`.
2. The system queries `credit_ledger` to find the exact transaction of type `class_reservation` for this class and user to identify which credit column (`indoor`, `train`, `pilates`, or `open`) was deducted.
3. The credit is refunded directly to that specific column.
4. **Fallback:** If no ledger entry is found (legacy reservation), the system maps the class discipline to determine the refund type (e.g., Indoor Cycling -> `indoor`, Train -> `train`, Pilates -> `pilates`, else `open`).

---

## 3. Credit Expiration Rules

* **Expiration Period:** All credits expire 30 days after the last credit addition (either via Stripe purchase or Admin manual addition).
* **Expiration Date Extension:** Adding any credits extends the user's `credits_expiration_date` by exactly 30 days from the moment of addition (`NOW() + INTERVAL '30 days'`).
* **Expired State:**
  - If `credits_expiration_date < NOW()`, the user's credits are considered expired.
  - The booking RPC will immediately reject reservations with the message: *"Tus créditos han expirado. Adquiere un nuevo paquete para reactivarlos."*
  - The daily automated sweep zeros out all credits and logs the sweep in `credit_ledger`.

---

## 4. Error Handling and RPC Responses

Every database RPC must raise standard exceptions with descriptive messages for handling in the frontend:
- **Insufficient Credits:** `"Sin créditos para [Discipina]. Adquiere un plan..."`
- **Double Booking:** `"Ya tienes una reserva en esta clase"`
- **Spot Taken:** `"El lugar ya está ocupado"`
- **Expired Credits:** `"Tus créditos han expirado..."`
- **Class Full / Invalid Spot:** `"El lugar ya está ocupado"`
- **Access Denied (Security):** `"Acceso denegado. Se requieren permisos de administrador."`

---

## 5. Security and Roles Matrix

Permissions are enforced at the database RPC layer using a `role` column in `public.profiles` (`client` | `admin`):

| Action / RPC | Client Permission | Admin Permission | Server-Side Verification |
|---|---|---|---|
| `reserve_spot_v2` | Yes (self booking) | Yes | None (any authenticated user can reserve for themselves) |
| `cancel_reservation_v2` | Yes (self cancellation) | Yes | None (any authenticated user can cancel their own spot) |
| `admin_reserve_spot_v2` | No | Yes | Assert caller profile role is `admin` |
| `add_credits_by_email` | No | Yes | Assert caller profile role is `admin` |
| `mark_attendance` | No | Yes | Assert caller profile role is `admin` |
| `get_all_users_admin` | No | Yes | Assert caller profile role is `admin` |
