import {
  startVerifiedGame,
  submitVerifiedGame,
  type StartGameMode,
  type StartedGameRun
} from "./services/game-service.ts";
export {
  startVerifiedGame,
  submitVerifiedGame,
  type StartGameMode,
  type StartedGameRun,
  type VerifiedGameSubmission
} from "./services/game-service.ts";
import {
  ensureAnonymousSession,
  getConfiguredSupabaseClient as configuredClient,
  getSupabaseClientIfConfigured,
  isSupabaseConfigured
} from "./services/supabase-client.ts";
import { profileFromServerData, type ServerPlayerProgress, type ServerAchievementAward } from "./player-progress.ts";
import type { Profile } from "./achievements.ts";
export type LeaderboardPeriod = "all" | "today" | "week";
export type LeaderboardDifficulty = "all" | "easy" | "medium" | "hard";
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

const supabase = getSupabaseClientIfConfigured();

const leaderboardCache = new Map<string, { expiresAt: number; entries: LeaderboardEntry[] }>();
const leaderboardRequests = new Map<string, Promise<LeaderboardEntry[]>>();
const summaryCache = new Map<string, { expiresAt: number; summary: PlayerSummary }>();
const summaryRequests = new Map<string, Promise<PlayerSummary>>();

export function isLeaderboardConfigured(): boolean {
  return isSupabaseConfigured();
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
