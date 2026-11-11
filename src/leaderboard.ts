import { createClient } from "@supabase/supabase-js";
import { profileFromServerData, type ServerPlayerProgress, type ServerAchievementAward } from "./player-progress.ts";
import type { Profile } from "./achievements.ts";
import {
  createDailyGameConfig,
  createStandardGameConfig,
  RNG_VERSION,
  RULES_VERSION,
  type Difficulty,
  type Position
} from "../shared/grid-rivals-rules.ts";

export type LeaderboardPeriod = "all" | "today" | "week";
export type LeaderboardDifficulty = "all" | "easy" | "medium" | "hard";
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

export type LeaderboardEntry = {
  rank: number;
  is_current_user: boolean;
  display_name: string;
  score: number;
  player_level: number;
  game_mode: string;
  achieved_at: string;
};

export type PlayerRecord = {
  user_id: string;
  display_name: string;
  player_level: number;
};

export type PlayerSummary = {
  best_score: number;
  player_rank: number | null;
  player_level: number;
};

export type PlayerProgressSnapshot = {
  profile: Profile;
  fetchedAt: number;
};

let playerProgressCache: { expiresAt: number; snapshot: PlayerProgressSnapshot } | null = null;
let playerProgressRequest: Promise<PlayerProgressSnapshot> | null = null;
let playerProgressRequestVersion = 0;

const DISPLAY_NAME_KEY = "grid-rivals-display-name";
const CACHE_TTL_MS = 30_000;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$/;
const BLOCKED_NAME_PATTERN = /(^|[^a-z])(fuck|shit|bitch|asshole|cunt)([^a-z]|$)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const runtimeEnv = import.meta.env || {} as ImportMetaEnv;
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY?.trim();
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  : null;

const leaderboardCache = new Map<string, { expiresAt: number; entries: LeaderboardEntry[] }>();
const leaderboardRequests = new Map<string, Promise<LeaderboardEntry[]>>();
const summaryCache = new Map<string, { expiresAt: number; summary: PlayerSummary }>();
const summaryRequests = new Map<string, Promise<PlayerSummary>>();
let sessionRequest: Promise<void> | null = null;
const verifiedSubmissions = new Map<string, Promise<VerifiedGameSubmission>>();

export function isLeaderboardConfigured(): boolean {
  return supabase !== null;
}

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (name.length < 3 || name.length > 20) {
    return "Use 3 to 20 characters.";
  }
  if (!NAME_PATTERN.test(name)) {
    return "Start with a letter or number; use only letters, numbers, spaces, _ or -.";
  }
  if (BLOCKED_NAME_PATTERN.test(name)) {
    return "Please choose a different display name.";
  }
  return null;
}

function configuredClient() {
  if (!supabase) {
    throw new Error("Leaderboard is not configured yet. Local scores are still saved on this device.");
  }
  return supabase;
}

async function ensureAnonymousSession() {
  const client = configuredClient();
  if (sessionRequest) return sessionRequest;

  sessionRequest = (async () => {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      const { error: signInError } = await client.auth.signInAnonymously();
      if (signInError) throw signInError;
    }
  })();

  try {
    await sessionRequest;
  } finally {
    sessionRequest = null;
  }
}

function firstRow<T>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new Error("The leaderboard service returned an empty response.");
  }
  return row as T;
}

function readDisplayName(): string | null {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

export function getStoredDisplayName(): string | null {
  return readDisplayName();
}

export async function ensurePlayerProfile(): Promise<PlayerRecord> {
  const client = configuredClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc("ensure_grid_rivals_profile_v2");
  if (error) throw error;

  const profile = firstRow<PlayerRecord>(data);
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, profile.display_name);
  } catch {
    // The remote profile remains available if browser storage is disabled.
  }

  return profile;
}

export async function updatePlayerDisplayName(value: string): Promise<{ displayName: string; synced: boolean }> {
  const name = value.trim();
  const validationError = validateDisplayName(name);
  if (validationError) throw new Error(validationError);

  if (!supabase || !navigator.onLine) {
    throw new Error("You are offline. Reconnect before changing your display name.");
  }

  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc("update_grid_rivals_display_name", {
    p_display_name: name
  });
  if (error) throw error;
  const displayName = firstRow<PlayerRecord>(data).display_name;
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, displayName);
  } catch {
    // The server profile remains authoritative if browser storage is unavailable.
  }
  return { displayName, synced: true };
}

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


export async function fetchPlayerProgress(forceRefresh = false): Promise<PlayerProgressSnapshot> {
  const client = configuredClient();
  if (!forceRefresh && playerProgressCache && playerProgressCache.expiresAt > Date.now()) {
    return playerProgressCache.snapshot;
  }
  if (!forceRefresh && playerProgressRequest) return playerProgressRequest;
  if (forceRefresh) playerProgressCache = null;
  const requestVersion = ++playerProgressRequestVersion;

  const request = (async () => {
    await ensureAnonymousSession();
    await ensurePlayerProfile();
    const [progressResponse, awardsResponse] = await Promise.all([
      client.from("grid_rivals_player_progress")
        .select("total_xp,player_level,games_completed,tiles_claimed,best_game_score,daily_challenges_completed,current_daily_streak")
        .single(),
      client.from("grid_rivals_achievement_awards")
        .select("achievement_id,unlocked_at")
    ]);
    if (progressResponse.error) throw progressResponse.error;
    if (awardsResponse.error) throw awardsResponse.error;

    const profile = profileFromServerData(
      progressResponse.data as ServerPlayerProgress,
      awardsResponse.data as ServerAchievementAward[]
    );
    const snapshot = { profile, fetchedAt: Date.now() };
    // A slower request must not overwrite a newer forced refresh.
    if (playerProgressRequestVersion === requestVersion) {
      playerProgressCache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return snapshot;
  })();

  playerProgressRequest = request;
  try {
    return await request;
  } finally {
    if (playerProgressRequest === request) playerProgressRequest = null;
  }
}

export async function refreshLeaderboardData(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  leaderboardCache.clear();
  summaryCache.clear();
  playerProgressCache = null;
  try {
    await Promise.all([
      fetchLeaderboard("all", "all", true),
      fetchPlayerSummary("all", "all")
    ]);
  } catch {
    // A verified result stays successful even if the follow-up refresh fails.
  }
}

export async function fetchLeaderboard(
  period: LeaderboardPeriod,
  difficulty: LeaderboardDifficulty,
  forceRefresh = false
): Promise<LeaderboardEntry[]> {
  const client = configuredClient();
  const key = `${period}:${difficulty}`;
  const cached = leaderboardCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.entries;
  if (!forceRefresh && leaderboardRequests.has(key)) return leaderboardRequests.get(key)!;

  const request = (async () => {
    await ensureAnonymousSession();
    const { data, error } = await client.rpc("get_grid_rivals_leaderboard", {
      p_period: period,
      p_difficulty: difficulty
    });
    if (error) throw error;
    const entries = Array.isArray(data) ? data as LeaderboardEntry[] : [];
    leaderboardCache.set(key, { entries, expiresAt: Date.now() + CACHE_TTL_MS });
    return entries.slice(0, 100);
  })();

  leaderboardRequests.set(key, request);
  try {
    return await request;
  } finally {
    leaderboardRequests.delete(key);
  }
}

export async function fetchPlayerSummary(
  period: LeaderboardPeriod,
  difficulty: LeaderboardDifficulty
): Promise<PlayerSummary> {
  const client = configuredClient();
  const key = `${period}:${difficulty}`;
  const cached = summaryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.summary;
  if (summaryRequests.has(key)) return summaryRequests.get(key)!;

  const request = (async () => {
    await ensureAnonymousSession();
    const { data, error } = await client.rpc("get_grid_rivals_player_summary", {
      p_period: period,
      p_difficulty: difficulty
    });
    if (error) throw error;
    const summary = firstRow<PlayerSummary>(data);
    summaryCache.set(key, { summary, expiresAt: Date.now() + CACHE_TTL_MS });
    return summary;
  })();

  summaryRequests.set(key, request);
  try {
    return await request;
  } finally {
    summaryRequests.delete(key);
  }
}
