// Contratar a un DJ/fotógrafo: crea el pago (con la comisión de la plataforma) y lo verifica
import { admin, COMMISSION, cors, currentUser, json, RETURN_PAGE, safeUrl, sessionForBooking, stripe, syncAccount } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await currentUser(req);
    if (!me) return json({ error: "Inicia sesión" }, 401);
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const s = await stripe();

    // --- Verificar un pago tras volver de Stripe (respaldo del webhook) ---
    if (body.action === "verify") {
      const { data: b } = await db.from("bookings").select("*").eq("id", body.booking_id).maybeSingle();
      if (!b || (b.client_id !== me.user.id && b.talent_id !== me.user.id)) return json({ error: "No encontrado" }, 404);
      if (b.status === "pagado") return json({ status: "pagado" });
      if (!b.stripe_session_id) return json({ status: b.status });
      const sess = await sessionForBooking(b);
      if (sess.payment_status === "paid") {
        await db.rpc("confirm_booking", { p_booking: b.id, p_payment_intent: String(sess.payment_intent ?? "") });
        return json({ status: "pagado" });
      }
      return json({ status: b.status });
    }

    // --- Crear pago ---
    const { data: app } = await db.from("applications")
      .select("*, events(*), profiles:talent_id(display_name, role)")
      .eq("id", body.application_id).maybeSingle();
    if (!app) return json({ error: "Postulación no encontrada" }, 404);
    const ev = app.events;
    if (ev.owner_id !== me.user.id) return json({ error: "Solo el organizador del evento puede contratar" }, 403);
    if (ev.status !== "abierto") return json({ error: "Este evento ya está cerrado" }, 409);
    if (app.status !== "pendiente") return json({ error: "Esta postulación ya no está disponible" }, 409);

    const pa = await syncAccount(app.talent_id);
    if (!pa?.charges_enabled) {
      return json({ error: "Este profesional aún no ha activado sus cobros. Pídele que lo haga desde su perfil." }, 409);
    }

    const amount = app.price_eur * 100;
    const fee = Math.round(amount * COMMISSION);
    const ins = await db.from("bookings").insert({
      event_id: ev.id, application_id: app.id, client_id: me.user.id, talent_id: app.talent_id,
      amount_cents: amount, fee_cents: fee,
    }).select().single();
    if (ins.error) throw ins.error;
    const booking = ins.data;

    const back = safeUrl(body.return_url);
    const withParams = (p: Record<string, string>) => {
      // Sin dominio propio (archivo local): página de vuelta en Supabase
      if (!back) return `${RETURN_PAGE}?t=${p.pago === "ok" ? "pago" : "cancelado"}&booking=${booking.id}`;
      const u = new URL(back);
      for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
      return u.toString(); // la query queda antes del #, como debe
    };
    const session = await s.checkout.sessions.create({
      mode: "payment",
      customer_email: me.user.email ?? undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amount,
          product_data: {
            name: `${app.profiles?.display_name ?? "Profesional"} · ${ev.title}`,
            description: `${new Date(ev.event_date).toLocaleDateString("es-ES")} · ${ev.city}`,
          },
        },
      }],
      payment_intent_data: {
        application_fee_amount: fee, // comisión de Cabina
        metadata: { booking_id: booking.id },
      },
      metadata: { booking_id: booking.id },
      success_url: withParams({ pago: "ok", booking: booking.id }),
      cancel_url: withParams({ pago: "cancelado" }),
    }, { stripeAccount: pa.stripe_account_id }); // cobro directo en la cuenta del artista
    await db.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);
    return json({ url: session.url, booking_id: booking.id });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
