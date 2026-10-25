// Página de vuelta desde Stripe cuando la web se abre como archivo local (sin dominio propio).
// Confirma el pago contra Stripe y muestra un mensaje para volver a la pestaña de Cabina.
import { admin, sessionForBooking } from "../_shared/common.ts";

function page(msg: string) {
  return new Response(`${msg}\n\nYa puedes cerrar esta pestaña y volver a Cabina: se actualizará sola.`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const t = u.searchParams.get("t");
  try {
    if (t === "pago") {
      const id = u.searchParams.get("booking") ?? "";
      const db = admin();
      const { data: b } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
      if (!b?.stripe_session_id) return page("No encontramos este pago.");
      const sess = await sessionForBooking(b);
      if (sess.payment_status === "paid") {
        await db.rpc("confirm_booking", { p_booking: b.id, p_payment_intent: String(sess.payment_intent ?? "") });
        return page("✅ Pago completado. El bolo está cerrado y el artista confirmado.");
      }
      return page("El pago todavía se está procesando.");
    }
    if (t === "cancelado") return page("Pago cancelado. No se ha cobrado nada.");
    if (t === "cobros") return page("Datos de cobro enviados a Stripe.");
    return page("Cabina");
  } catch (e) {
    console.error(e);
    return page("Ha habido un problema comprobando el pago. Vuelve a Cabina y recarga.");
  }
});
