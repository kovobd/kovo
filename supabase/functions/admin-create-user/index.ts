// Admin-only endpoint to create a new Supabase auth user and assign a role,
// WITHOUT replacing the caller's session (which `supabase.auth.signUp` does
// on the client when email autoconfirm is on). Service-role only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!r.ok) return false;
  const u = await r.json();
  if (!u?.id) return false;
  const rr = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${u.id}&role=eq.admin&select=role`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = await rr.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  try {
    if (!(await isAdmin(req.headers.get("Authorization")))) {
      return json({ ok: false, message: "Forbidden — admin only." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const role = body.role === "admin" ? "admin" : "staff";

    if (!email || !password) return json({ ok: false, message: "Email and password are required" }, 400);
    if (password.length < 6) return json({ ok: false, message: "Password must be at least 6 characters" }, 400);

    // Create the auth user via Admin API. auto-confirm so they can log in immediately.
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || email.split("@")[0] },
      }),
    });

    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      return json({ ok: false, message: createJson?.msg || createJson?.message || "Failed to create user" }, createRes.status);
    }
    const userId = createJson?.id;
    if (!userId) return json({ ok: false, message: "Auth API returned no user id" }, 500);

    // Insert role
    const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ user_id: userId, role }),
    });
    if (!roleRes.ok) {
      const rj = await roleRes.json().catch(() => ({}));
      return json({ ok: true, user_id: userId, warning: `User created but role assignment failed: ${rj?.message ?? "unknown"}` });
    }

    return json({ ok: true, user_id: userId });
  } catch (e) {
    return json({ ok: false, message: (e as Error)?.message ?? "Internal error" }, 500);
  }
});
