// Registro: crea la cuenta (sin email de confirmación) y guarda si acepta emails comerciales.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ROLES = ["dj", "fotografo", "promotor", "discoteca"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const role = String(b.role ?? "");
    const name = String(b.display_name ?? "").trim().slice(0, 80);
    const city = String(b.city ?? "").trim().slice(0, 80);
    const marketing = b.marketing === true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Ese email no parece válido." }, 400);
    if (password.length < 8) return json({ error: "La contraseña necesita 8 caracteres o más." }, 400);
    if (!ROLES.includes(role)) return json({ error: "Elige qué tipo de cuenta quieres." }, 400);
    if (name.length < 2) return json({ error: "Escribe tu nombre (mínimo 2 letras)." }, 400);
    if (b.terms !== true) return json({ error: "Tienes que aceptar las condiciones y la política de privacidad." }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { error } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role, display_name: name, city, marketing, terms_accepted_at: new Date().toISOString() },
    });
    if (error) {
      const msg = /already|registered|exists/i.test(error.message)
        ? "Ya existe una cuenta con ese email. Entra con tu contraseña." : error.message;
      return json({ error: msg }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "No se ha podido crear la cuenta. Inténtalo de nuevo." }, 500);
  }
});
