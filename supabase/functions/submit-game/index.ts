import { createClient } from "npm:@supabase/supabase-js@2";
import {
  parseSubmitGameRequest,
  VerificationError,
  verifyConsumedRunRetry,
  verifyGameTranscript,
  type StoredGameRun
} from "../_shared/submit-game-verifier.ts";

const MAX_BODY_LENGTH = 4096;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://grid-rivals.pages.dev",
  "http://localhost:5173"
];

type FinalizationRow = {
  accepted: boolean;
  duplicate: boolean;
  score_id: string | null;
  total_xp: number | string;
  player_level: number;
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
    throw new HttpError(503, "The submit-game service is not configured.");
  }

  const clientOptions = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  } as const;

  return {
    authClient: createClient<any>(supabaseUrl, anonKey, {
      ...clientOptions,
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    }),
    serviceClient: createClient<any>(supabaseUrl, serviceRoleKey, clientOptions)
  };
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new HttpError(401, "A valid Supabase access token is required.");
  return match[1];
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_LENGTH) {
      throw new HttpError(413, "Request body is too large or has an invalid Content-Length.");
    }
  }
  if (!request.body) throw new HttpError(400, "Request body is required.");

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

function verificationHttpStatus(error: VerificationError): number {
  switch (error.code) {
    case "invalid-request":
    case "invalid-run-id":
    case "invalid-transcript":
      return 400;
    case "run-not-found":
    case "wrong-owner":
      return 404;
    case "consumed-run":
      return 409;
    case "expired-run":
      return 410;
    case "unsupported-version":
    case "invalid-run-config":
      return 409;
    case "illegal-move":
    case "incomplete-game":
    case "invalid-result":
      return 422;
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
    return jsonResponse(request, 405, { error: "Use POST to submit a game." });
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

    const ageGate = userData.user.app_metadata?.grid_rivals_age_gate;
    if (
      !ageGate ||
      ageGate.policyVersion !== 1 ||
      ageGate.eligible !== true ||
      (ageGate.country !== "IN" && ageGate.country !== "OTHER")
    ) {
      throw new HttpError(403, "Confirm that you meet the minimum age before playing.");
    }

    const input = parseSubmitGameRequest(await readJsonBody(request));
    const { data: run, error: runError } = await clients.serviceClient
      .from("grid_rivals_game_runs")
      .select("run_id,user_id,game_mode,difficulty,seed,rules_version,rng_version,daily_date,started_at,expires_at,consumed_at,final_result,score_id")
      .eq("run_id", input.runId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (runError) {
      console.error("Could not load Grid Rivals game run:", runError.message);
      throw new HttpError(503, "Could not verify this game. Please retry.");
    }
    if (!run) {
      throw new HttpError(404, "Game run was not found.");
    }

    let verified;
    try {
      verified = run.consumed_at === null
        ? verifyGameTranscript(run as StoredGameRun, userData.user.id, input.moves, new Date())
        : verifyConsumedRunRetry(run as StoredGameRun, userData.user.id, input.moves, new Date());
    } catch (error) {
      if (error instanceof VerificationError) {
        throw new HttpError(verificationHttpStatus(error), error.message);
      }
      throw error;
    }

    const { data: finalizationRows, error: finalizationError } = await clients.serviceClient.rpc(
      "finalize_grid_rivals_run",
      {
        p_run_id: verified.runId,
        p_score: verified.score,
        p_final_status: verified.status,
        p_moves_played: verified.movesPlayed,
        p_moves_remaining: verified.movesRemaining,
        p_tiles_claimed: verified.tilesClaimed
      }
    );

    if (finalizationError) {
      console.error("Could not finalize Grid Rivals run:", finalizationError.message);
      throw new HttpError(503, "Could not save this verified result. Please retry.");
    }

    const result = Array.isArray(finalizationRows)
      ? finalizationRows[0] as FinalizationRow | undefined
      : undefined;
    if (!result) {
      throw new HttpError(503, "Could not save this verified result. Please retry.");
    }
    if (result.duplicate) {
      const { data: finalizedRun, error: finalizedRunError } = await clients.serviceClient
        .from("grid_rivals_game_runs")
        .select("run_id,user_id,game_mode,difficulty,seed,rules_version,rng_version,daily_date,started_at,expires_at,consumed_at,final_result,score_id")
        .eq("run_id", verified.runId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (finalizedRunError || !finalizedRun || finalizedRun.score_id !== result.score_id) {
        throw new HttpError(409, "This game run has already been submitted with a different result.");
      }
      try {
        verified = verifyConsumedRunRetry(
          finalizedRun as StoredGameRun,
          userData.user.id,
          input.moves,
          new Date()
        );
      } catch {
        throw new HttpError(409, "This game run has already been submitted with a different transcript.");
      }
    } else if (!result.accepted) {
      throw new HttpError(409, "This game run could not be accepted.");
    }
    if (!result.score_id) {
      throw new HttpError(503, "The verified result was saved without a score reference.");
    }

    return jsonResponse(request, 200, {
      accepted: true,
      duplicate: result.duplicate,
      runId: verified.runId,
      scoreId: result.score_id,
      score: verified.score,
      gameMode: verified.gameMode,
      difficulty: verified.difficulty,
      status: verified.status,
      movesPlayed: verified.movesPlayed,
      movesRemaining: verified.movesRemaining,
      totalXp: result.total_xp,
      playerLevel: result.player_level
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, { error: error.message });
    }
    console.error("Unexpected submit-game error:", error);
    return jsonResponse(request, 500, { error: "Unable to verify this game right now." });
  }
}

Deno.serve(handler);
