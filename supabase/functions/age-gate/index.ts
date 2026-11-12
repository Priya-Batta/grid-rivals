import { createClient } from "npm:@supabase/supabase-js@2";

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  const values = configured
    ? configured.split(",").map((origin) => origin.trim()).filter(Boolean)
    : ["https://grid-rivals.pages.dev", "http://localhost:5173"];
  return new Set(values);
}
const POLICY_VERSION = 1;

function cors(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins().has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function respond(request: Request, status: number, body: Record<string, unknown>): Response {
  const headers = cors(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) return respond(request, 403, { error: "Origin not allowed." });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== "POST") return respond(request, 405, { error: "Use POST." });

  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) return respond(request, 401, { error: "A valid session is required." });

    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return respond(request, 503, { error: "Age confirmation service is not configured." });

    const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } } as const;
    const authClient = createClient(url, anon, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const adminClient = createClient(url, service, options);
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) return respond(request, 401, { error: "Session is invalid or expired." });

    let body: unknown;
    try { body = await request.json(); } catch { return respond(request, 400, { error: "Invalid JSON." }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return respond(request, 400, { error: "Invalid request." });
    const input = body as Record<string, unknown>;

    if (input.action === "status" && Object.keys(input).length === 1) {
      const { data: storedUser, error: storedUserError } = await adminClient.auth.admin.getUserById(data.user.id);
      if (storedUserError || !storedUser.user) return respond(request, 503, { error: "Could not load age confirmation." });
      const record = storedUser.user.app_metadata?.grid_rivals_age_gate;
      if (!record || record.policyVersion !== POLICY_VERSION || typeof record.eligible !== "boolean") {
        return respond(request, 200, { confirmed: false });
      }
      return respond(request, 200, {
        confirmed: true,
        eligible: record.eligible,
        country: record.country,
        policyVersion: record.policyVersion
      });
    }

    if (
      input.action !== "confirm" ||
      Object.keys(input).some((key) => !["action", "country", "eligible"].includes(key)) ||
      (input.country !== "IN" && input.country !== "OTHER") ||
      typeof input.eligible !== "boolean"
    ) return respond(request, 400, { error: "Choose a country and confirm the applicable minimum age." });

    const { data: latestUser, error: latestUserError } = await adminClient.auth.admin.getUserById(data.user.id);
    if (latestUserError || !latestUser.user) return respond(request, 503, { error: "Could not save age confirmation." });
    const existingRecord = latestUser.user.app_metadata?.grid_rivals_age_gate;
    if (existingRecord?.policyVersion === POLICY_VERSION) {
      return respond(request, 409, { error: "Age confirmation has already been recorded for this policy." });
    }

    const record = {
      country: input.country,
      eligible: input.eligible,
      policyVersion: POLICY_VERSION,
      confirmedAt: new Date().toISOString()
    };
    const { error: updateError } = await adminClient.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...latestUser.user.app_metadata, grid_rivals_age_gate: record }
    });
    if (updateError) {
      console.error("Could not save Grid Rivals age confirmation:", updateError.message);
      return respond(request, 503, { error: "Could not save your confirmation. Please retry." });
    }
    return respond(request, 200, { confirmed: true, eligible: record.eligible, country: record.country, policyVersion: POLICY_VERSION });
  } catch (error) {
    console.error("Unexpected age-gate error:", error);
    return respond(request, 500, { error: "Could not process age confirmation." });
  }
});
