// Registro sin email de confirmación (modo pruebas). Crea la cuenta ya confirmada;
// la web inicia sesión justo después con email y contraseña.
import { admin, cors, json } from "../_shared/common.ts";

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Ese email no parece válido." }, 400);
    if (password.length < 8) return json({ error: "La contraseña necesita 8 caracteres o más." }, 400);
    if (!ROLES.includes(role)) return json({ error: "Elige qué tipo de cuenta quieres." }, 400);
    if (name.length < 2) return json({ error: "Escribe tu nombre (mínimo 2 letras)." }, 400);
    const { error } = await admin().auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role, display_name: name, city },
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
