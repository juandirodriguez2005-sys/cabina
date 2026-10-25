# Cabina

Plataforma para contratar DJs y fotógrafos. Salas y promotores publican bolos, el talento se postula con su precio y el pago se hace dentro de la web. Registro gratis; la plataforma cobra un 10 % solo cuando un bolo se cierra (Stripe Connect, `application_fee_amount`).

## Qué hay ya en marcha
- **Supabase** (proyecto `cabina`, `cgygbyqwficmxyxihnoe`, París): tablas `profiles`, `events`, `applications`, `bookings`, `payout_accounts`, con RLS probada.
- **Funciones**: `stripe-connect` (alta de cobros del DJ/fotógrafo), `bookings` (crea el pago y lo verifica), `stripe-webhook`.
- **Stripe (sandbox DJWORK)**: dos webhooks apuntando a `stripe-webhook` (pagos y estado de cuentas Connect).
- **Web**: `web/index.html`, un solo archivo.

## Lo que falta (5 minutos, desde tu navegador)
1. **Clave de Stripe** → Supabase › Edge Functions › Secrets › añade `STRIPE_SECRET_KEY` con tu `sk_test_…` de DJWORK.
2. **Publicar la web** → sube esta carpeta a un repo de GitHub y en Render: New › Blueprint (usa `render.yaml`). O conecta GitHub a Claude y lo hago yo.
3. **Auth** → Supabase › Authentication › URL Configuration: pon la URL de Render como *Site URL* y en *Redirect URLs*.

## Cambiar la comisión
`supabase/functions/_shared/common.ts` → `COMMISSION` y `web/index.html` → `COMMISSION`.

## Probar un pago
Tarjeta de prueba `4242 4242 4242 4242`, cualquier fecha futura y CVC. En el alta de cobros del DJ, Stripe en modo test permite datos de prueba ("Use test data").
