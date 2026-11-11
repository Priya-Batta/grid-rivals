import {
  ensureAnonymousSession,
  getConfiguredSupabaseClient as configuredClient
} from "./supabase-client.ts";
import {
  createDailyGameConfig,
  createStandardGameConfig,
  RNG_VERSION,
  RULES_VERSION,
  type Difficulty,
  type Position
} from "../../shared/grid-rivals-rules.ts";

export type StartGameMode = "standard" | "daily";

export type StartGameMode = "standard" | "daily";

export type StartedGameRun = {
  runId: string;
  mode: StartGameMode;
  difficulty: "Easy" | "Medium" | "Hard";
  seed: number;
  rulesVersion: number;
  rngVersion: number;
  dailyDate: string | null;
  startedAt: string;
  expiresAt: string;
};

export type VerifiedGameSubmission = {
  accepted: true;
  duplicate: boolean;
  runId: string;
  scoreId: string;
  score: number;
  gameMode: string;
  difficulty: string;
  status: "won" | "lost";
  movesPlayed: number;
  movesRemaining: number;
  totalXp: number | string;
  playerLevel: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const verifiedSubmissions = new Map<string, Promise<VerifiedGameSubmission>>();

function functionError(error: unknown): Error {
  const candidate = error as { context?: unknown; message?: string };
  if (candidate.context instanceof Response) {
    const status = candidate.context.status;
    if (status === 401) return new Error("Your Supabase session expired. Reconnect and retry.");
    return new Error(`Server verification failed (${status}). Retry this same run when connected.`);
  }
  return new Error(candidate.message || "Could not reach the game verification service.");
}

async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const client = configuredClient();
  await ensureAnonymousSession();

  let response = await client.functions.invoke<T>(name, { body });
  if (response.error) {
    const context = (response.error as { context?: unknown }).context;
    const status = context instanceof Response ? context.status : undefined;
    if (status === 401) {
      const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
      if (!refreshError && refreshed.session) {
        response = await client.functions.invoke<T>(name, { body });
      }
    }
  }
  if (response.error) throw functionError(response.error);
  if (response.data === null) throw new Error("The verification service returned an empty response.");
  return response.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStartedRun(value: unknown, mode: StartGameMode, difficulty: Difficulty): StartedGameRun {
  if (!isRecord(value)) throw new Error("The start-game service returned an invalid response.");
  if (
    typeof value.runId !== "string" || !UUID_PATTERN.test(value.runId) ||
    value.mode !== mode || value.difficulty !== difficulty ||
    !Number.isInteger(value.seed) ||
    value.rulesVersion !== RULES_VERSION || value.rngVersion !== RNG_VERSION ||
    typeof value.startedAt !== "string" || typeof value.expiresAt !== "string"
  ) {
    throw new Error("The start-game service returned an invalid run configuration.");
  }

  const run: StartedGameRun = {
    runId: value.runId,
    mode,
    difficulty,
    seed: value.seed as number,
    rulesVersion: value.rulesVersion as number,
    rngVersion: value.rngVersion as number,
    dailyDate: typeof value.dailyDate === "string" ? value.dailyDate : null,
    startedAt: value.startedAt,
    expiresAt: value.expiresAt
  };

  if (mode === "daily") {
    if (difficulty !== "Medium" || run.dailyDate === null) {
      throw new Error("The start-game service returned an invalid Daily configuration.");
    }
    createDailyGameConfig(run.dailyDate);
    if (run.seed !== createDailyGameConfig(run.dailyDate).seed) {
      throw new Error("The Daily seed does not match its UTC date.");
    }
  } else {
    if (run.dailyDate !== null) throw new Error("Standard runs cannot include a Daily date.");
    createStandardGameConfig(difficulty, run.seed);
  }
  if (Date.parse(run.expiresAt) <= Date.parse(run.startedAt)) {
    throw new Error("The start-game service returned invalid expiry times.");
  }

  return run;
}

export async function startVerifiedGame(mode: StartGameMode, difficulty: Difficulty): Promise<StartedGameRun> {
  if (mode === "daily" && difficulty !== "Medium") {
    throw new Error("Daily mode uses Medium difficulty.");
  }
  const response = await invokeEdgeFunction<unknown>("start-game", { mode, difficulty });
  return parseStartedRun(response, mode, difficulty);
}

function parseVerifiedSubmission(value: unknown, runId: string): VerifiedGameSubmission {
  if (!isRecord(value)) throw new Error("The submit-game service returned an invalid response.");
  if (
    value.accepted !== true ||
    typeof value.duplicate !== "boolean" ||
    value.runId !== runId ||
    typeof value.scoreId !== "string" ||
    !Number.isInteger(value.score) ||
    (value.status !== "won" && value.status !== "lost") ||
    !Number.isInteger(value.movesPlayed) ||
    !Number.isInteger(value.movesRemaining) ||
    !Number.isInteger(value.playerLevel) ||
    (typeof value.totalXp !== "number" && typeof value.totalXp !== "string")
  ) {
    throw new Error("The submit-game service returned an invalid verified result.");
  }
  return value as unknown as VerifiedGameSubmission;
}

export function submitVerifiedGame(runId: string, moves: readonly Position[]): Promise<VerifiedGameSubmission> {
  const existing = verifiedSubmissions.get(runId);
  if (existing) return existing;

  const request = invokeEdgeFunction<unknown>("submit-game", {
    runId,
    moves: moves.map(({ x, y }) => ({ x, y }))
  }).then((response) => parseVerifiedSubmission(response, runId));

  const sharedRequest = request.finally(() => {
    if (verifiedSubmissions.get(runId) === sharedRequest) verifiedSubmissions.delete(runId);
  });
  verifiedSubmissions.set(runId, sharedRequest);
  return sharedRequest;
}
