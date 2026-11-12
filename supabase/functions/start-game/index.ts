import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createDailyGameConfig,
  createStandardGameConfig,
  type Difficulty,
  type GameConfig
} from "../../../shared/grid-rivals-rules.ts";

const MAX_BODY_LENGTH = 4096;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://grid-rivals.pages.dev",
  "http://localhost:5173"
];

type StartGameRequest = {
  mode: "standard" | "daily";
  difficulty: Difficulty;
};

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  const values = configured
    ? configured.split(",").map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return new Set(values);
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function jsonResponse(request: Request, status: number, payload: Record<string, unknown>): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}

function getConfiguredClients(accessToken: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new HttpError(503, "The start-game service is not configured.");
  }

  const clientOptions = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  } as const;

  const authClient = createClient<any>(supabaseUrl, anonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
  const serviceClient = createClient<any>(supabaseUrl, serviceRoleKey, clientOptions);
  return { authClient, serviceClient };
}

function secureSeed(): number {
  const range = 2_147_483_646;
  const uint32Range = 0x1_0000_0000;
  const acceptanceLimit = Math.floor(uint32Range / range) * range;
  const sample = new Uint32Array(1);

  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= acceptanceLimit);

  return (sample[0] % range) + 1;
}

function parseStartRequest(value: unknown): StartGameRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }

  const body = value as Record<string, unknown>;
  const unknownFields = Object.keys(body).filter((key) => key !== "mode" && key !== "difficulty");
  if (unknownFields.length > 0) {
    throw new HttpError(400, "Only mode and difficulty may be provided.");
  }

  if (body.mode !== "standard" && body.mode !== "daily") {
    throw new HttpError(400, "Mode must be 'standard' or 'daily'.");
  }

  if (body.difficulty !== "Easy" && body.difficulty !== "Medium" && body.difficulty !== "Hard") {
    throw new HttpError(400, "Difficulty must be Easy, Medium, or Hard.");
  }

  if (body.mode === "daily" && body.difficulty !== "Medium") {
    throw new HttpError(400, "Daily mode uses Medium difficulty.");
  }

  return { mode: body.mode, difficulty: body.difficulty };
}

function createRunConfig(input: StartGameRequest, startedAt: Date): GameConfig {
  if (input.mode === "daily") {
    const utcDate = startedAt.toISOString().slice(0, 10);
    return createDailyGameConfig(utcDate);
  }

  return createStandardGameConfig(input.difficulty, secureSeed());
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new HttpError(401, "A valid Supabase access token is required.");
  return match[1];
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_LENGTH) {
    throw new HttpError(413, "Request body is too large.");
  }

  if (!request.body) {
    throw new HttpError(400, "Request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_LENGTH) {
        await reader.cancel("Request body limit exceeded.").catch(() => undefined);
        throw new HttpError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Unable to read request body.");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON.");
  }
}

export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse(request, 403, { error: "This origin is not allowed." });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Use POST to start a game." });
  }
  if (Deno.env.get("GRID_RIVALS_STARTS_PAUSED") === "true") {
    return jsonResponse(request, 503, {
      error: "New games are temporarily paused. Please try again shortly."
    });
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(request, 415, { error: "Content-Type must be application/json." });
  }

  try {
    const token = bearerToken(request);
    const clients = getConfiguredClients(token);
    const { data: userData, error: authError } = await clients.authClient.auth.getUser(token);
    if (authError || !userData.user) {
      throw new HttpError(401, "Supabase access token is invalid or expired.");
    }

    const input = parseStartRequest(await readJsonBody(request));
    const standardSeed = input.mode === "standard" ? secureSeed() : null;
    if (standardSeed !== null) {
      createStandardGameConfig(input.difficulty, standardSeed);
    }

    const databaseMode = input.mode === "daily" ? "daily" : input.difficulty.toLowerCase();
    const { data: runRows, error: createError } = await clients.serviceClient.rpc(
      "create_grid_rivals_game_run",
      {
        p_user_id: userData.user.id,
        p_game_mode: databaseMode,
        p_difficulty: input.difficulty.toLowerCase(),
        p_standard_seed: standardSeed
      }
    );

    if (createError) {
      if (createError.message.toLowerCase().includes("limit reached")) {
        throw new HttpError(429, "Run creation limit reached. Please try again later.");
      }
      if (createError.message.includes("60 seconds remain")) {
        throw new HttpError(409, "The daily challenge is too close to UTC midnight. Try again tomorrow.");
      }
      console.error("Could not create Grid Rivals game run:", createError.message);
      throw new HttpError(503, "Could not start a verified game. Please retry.");
    }

    const run = Array.isArray(runRows) ? runRows[0] : null;
    if (!run) {
      throw new HttpError(503, "Could not start a verified game. Please retry.");
    }

    let config: GameConfig;
    if (input.mode === "daily") {
      if (typeof run.daily_date !== "string") {
        throw new HttpError(503, "The database returned an invalid daily configuration.");
      }
      config = createDailyGameConfig(run.daily_date);
      if (config.seed !== Number(run.seed)) {
        throw new HttpError(503, "The database returned an invalid daily seed.");
      }
    } else {
      config = createStandardGameConfig(input.difficulty, Number(run.seed));
    }

    if (
      run.game_mode !== databaseMode ||
      run.difficulty !== input.difficulty.toLowerCase() ||
      run.rules_version !== config.rulesVersion ||
      run.rng_version !== config.rngVersion ||
      typeof run.run_id !== "string" ||
      typeof run.started_at !== "string" ||
      typeof run.expires_at !== "string"
    ) {
      throw new HttpError(503, "The database returned an invalid game run.");
    }

    return jsonResponse(request, 201, {
      runId: run.run_id,
      mode: config.mode,
      difficulty: config.difficulty,
      seed: config.seed,
      rulesVersion: config.rulesVersion,
      rngVersion: config.rngVersion,
      dailyDate: config.mode === "daily" ? config.dailyDate : null,
      startedAt: run.started_at,
      expiresAt: run.expires_at
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, { error: error.message });
    }
    console.error("Unexpected start-game error:", error);
    return jsonResponse(request, 500, { error: "Unable to start a game right now." });
  }
}

Deno.serve(handler);
