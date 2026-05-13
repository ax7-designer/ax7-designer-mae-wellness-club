# Registro de Auditoría de Créditos - 13 de Mayo, 2026

## Incidencia: Paquetes Mensuales con 99 Créditos

Se detectó una falla en la configuración previa donde los paquetes "Monthly" estaban asignando 99 créditos en lugar de la cantidad correcta (22 o 27 créditos dependiendo del tipo).

### Resoluciones Manuales en Base de Datos

**1. Usuario: cpavonr@gmail.com**
* **Problema:** Recibió 99 créditos por un paquete "Monthly" (deberían ser 22).
* **Solución:** Se realizó el ajuste del balance, considerando los créditos previamente consumidos. Se insertó un registro `manual_admin` en el `credit_ledger` para justificar el descuento.

**2. Usuaria: Karla Loaiza (karlaloaizablanco@gmail.com)**
* **Problema:** Balance inflado a 99 créditos por el mismo error en el paquete mensual.
* **Ecuación de ajuste:** 
  * Balance previo a la compra: 9 créditos.
  * Paquete correcto: 22 créditos.
  * Total esperado: 31 créditos.
  * Consumo registrado (reservas efectivas y cancelaciones) desde la fecha de compra: -9 créditos.
  * Balance corregido: 22 créditos.
* **Solución:** Se restaron 77 créditos de su cuenta para llegar al balance correcto de 22 créditos actuales. Se documentó el descuento en el `credit_ledger` bajo el tipo `manual_admin`.

### Prevención a Futuro
Se han actualizado las variables en `create-stripe-links.mjs` para asegurar que los productos de Stripe ahora reflejen las cantidades correctas de créditos (22 para paquetes estándar y 27 para VIP). El webhook de Stripe (`supabase/functions/stripe-webhook/index.ts`) respeta estas configuraciones de producto.
