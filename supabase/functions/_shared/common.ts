import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const COMMISSION = 0.10; // 10 % para la plataforma
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const RETURN_PAGE = `${SUPABASE_URL}/functions/v1/volver`;
const V2_VERSION = "2026-09-30.preview";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function admin() {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

let _key: string | null = null;
async function stripeKey() {
  if (_key) return _key;
  let key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) {
    const { data } = await admin().rpc("get_secret", { p_key: "STRIPE_SECRET_KEY" });
    key = data ?? undefined;
  }
  if (!key) throw new Error("Los pagos aún no están configurados (falta la clave de Stripe).");
  _key = key;
  return key;
}

let _stripe: Stripe | null = null;
/** Cliente Stripe (API v1). Clave: secreto de Supabase o, si no existe, private.config */
export async function stripe() {
  if (_stripe) return _stripe;
  _stripe = new Stripe(await stripeKey(), { apiVersion: "2024-12-18.acacia" });
  return _stripe;
}

/** Llamada a la API v2 de Stripe (cuentas conectadas) */
export async function stripeV2(path: string, body: unknown) {
  const r = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await stripeKey()}`,
      "Content-Type": "application/json",
      "Stripe-Version": V2_VERSION,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? "Error de Stripe");
  return j;
}

/** Devuelve el usuario autenticado y su perfil, o null */
export async function currentUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db.from("profiles").select("*").eq("id", data.user.id).single();
  if (!profile) return null;
  return { user: data.user, profile };
}

/** URL de vuelta válida para Stripe (https); si no, null */
export function safeUrl(u: unknown): string | null {
  try {
    const url = new URL(String(u));
    if (url.protocol === "https:") return url.toString();
  } catch (_) { /* noop */ }
  return null;
}

/** Sincroniza el estado de la cuenta de cobro del profesional */
export async function syncAccount(profileId: string) {
  const db = admin();
  const { data: pa } = await db.from("payout_accounts").select("*").eq("profile_id", profileId).maybeSingle();
  if (!pa) return null;
  const acct = await (await stripe()).accounts.retrieve(pa.stripe_account_id);
  const ready = !!acct.charges_enabled;
  if (ready !== pa.charges_enabled) {
    await db.from("payout_accounts").update({ charges_enabled: ready, updated_at: new Date().toISOString() })
      .eq("profile_id", profileId);
  }
  return { ...pa, charges_enabled: ready };
}

/** Crea la cuenta conectada (Accounts v2, panel Express, riesgo gestionado por Stripe).
 *  El artista cobra directamente (es el vendedor) y Cabina se queda su comisión. */
export async function createConnectedAccount(profile: { id: string; display_name: string; role: string }, email: string) {
  const [given, ...rest] = profile.display_name.split(" ");
  const acct = await stripeV2("/v2/core/accounts", {
    contact_email: email,
    display_name: profile.display_name,
    dashboard: "express",
    identity: {
      country: "es",
      entity_type: "individual",
      individual: { given_name: given, ...(rest.length ? { surname: rest.join(" ") } : {}), email },
    },
    configuration: { merchant: { mcc: "7929", capabilities: { card_payments: { requested: true } } } },
    defaults: {
      currency: "eur",
      locales: ["es-ES"],
      responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
    },
    metadata: { profile_id: profile.id },
  });
  const db = admin();
  const { data, error } = await db.from("payout_accounts")
    .upsert({ profile_id: profile.id, stripe_account_id: acct.id, charges_enabled: false }).select().single();
  if (error) throw error;
  return data;
}

/** Lee la sesión de pago de una contratación (vive en la cuenta del artista) */
export async function sessionForBooking(b: { talent_id: string; stripe_session_id: string }) {
  const { data: pa } = await admin().from("payout_accounts").select("stripe_account_id").eq("profile_id", b.talent_id).single();
  return (await stripe()).checkout.sessions.retrieve(b.stripe_session_id, {}, { stripeAccount: pa!.stripe_account_id });
}

/** Enlace al formulario de alta de Stripe */
export async function onboardingLink(accountId: string, returnUrl: string) {
  const link = await stripeV2("/v2/core/account_links", {
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        return_url: returnUrl,
        refresh_url: returnUrl,
      },
    },
  });
  return link.url as string;
}
