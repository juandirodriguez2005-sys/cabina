// Alta de cobros para DJs y fotógrafos (Stripe Connect, cuentas v2)
import { admin, cors, createConnectedAccount, currentUser, json, onboardingLink, RETURN_PAGE, safeUrl, syncAccount } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await currentUser(req);
    if (!me) return json({ error: "Inicia sesión" }, 401);
    if (!["dj", "fotografo"].includes(me.profile.role)) {
      return json({ error: "Solo DJs y fotógrafos necesitan cuenta de cobro" }, 403);
    }
    const body = await req.json().catch(() => ({}));

    if ((body.action ?? "onboard") === "status") {
      const pa = await syncAccount(me.user.id);
      return json({ connected: !!pa, ready: !!pa?.charges_enabled });
    }

    let { data: pa } = await admin().from("payout_accounts").select("*").eq("profile_id", me.user.id).maybeSingle();
    if (!pa) pa = await createConnectedAccount(me.profile, me.user.email ?? "");
    const back = safeUrl(body.return_url) ?? `${RETURN_PAGE}?t=cobros`;
    return json({ url: await onboardingLink(pa.stripe_account_id, back) });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
