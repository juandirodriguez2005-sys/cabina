// Webhook de Stripe. No confía en el contenido recibido: vuelve a pedir cada objeto a Stripe.
import { admin, json, stripe, syncAccount } from "../_shared/common.ts";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const s = await stripe();
    const type = String(payload?.type ?? "");
    const obj = payload?.data?.object ?? {};
    const db = admin();

    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const sess = await s.checkout.sessions.retrieve(String(obj.id), {}, payload?.account ? { stripeAccount: String(payload.account) } : undefined);
      const bookingId = sess.metadata?.booking_id;
      if (bookingId && sess.payment_status === "paid") {
        await db.rpc("confirm_booking", { p_booking: bookingId, p_payment_intent: String(sess.payment_intent ?? "") });
      }
    } else if (type === "account.updated") {
      const acct = await s.accounts.retrieve(String(obj.id));
      const pid = acct.metadata?.profile_id;
      if (pid) await syncAccount(pid);
    }
    return json({ received: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 400);
  }
});
