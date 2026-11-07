import {
  fetchPlayerProgress,
  getStoredDisplayName,
  isLeaderboardConfigured,
  startVerifiedGame,
  submitVerifiedGame,
  updatePlayerDisplayName,
  validateDisplayName
} from "./leaderboard.ts";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  },
  configurable: true
});

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  assert(!isLeaderboardConfigured(), "missing credentials disable remote leaderboard only");
  assert(validateDisplayName("Nova Rivals") === null, "valid display name accepted");
  assert(Boolean(validateDisplayName("")), "empty display name rejected");
  assert(Boolean(validateDisplayName("x".repeat(21))), "overlong display name rejected");
  assert(Boolean(validateDisplayName("<script>")), "markup characters rejected");
  assert(Boolean(validateDisplayName("shit player")), "blocked language rejected");

  let offlineNameRejected = false;
  try {
    await updatePlayerDisplayName("Nova Rivals");
  } catch (error) {
    offlineNameRejected = error instanceof Error && error.message.includes("offline");
  }
  assert(offlineNameRejected, "offline display-name changes are not treated as saved");
  assert(getStoredDisplayName() === null, "an unsynced display name is not cached as canonical");

  let progressUnavailable = false;
  try {
    await fetchPlayerProgress();
  } catch (error) {
    progressUnavailable = error instanceof Error && error.message.includes("not configured");
  }
  assert(progressUnavailable, "server progression is unavailable without Supabase config");

  let startUnavailable = false;
  try {
    await startVerifiedGame("standard", "Easy");
  } catch (error) {
    startUnavailable = error instanceof Error && error.message.includes("not configured");
  }
  assert(startUnavailable, "verified game start is unavailable without Supabase config");

  let submissionUnavailable = false;
  try {
    await submitVerifiedGame("00000000-0000-4000-8000-000000000001", [{ x: 4, y: 3 }]);
  } catch (error) {
    submissionUnavailable = error instanceof Error && error.message.includes("not configured");
  }
  assert(submissionUnavailable, "verified submission is unavailable without Supabase config");

  console.log("leaderboard tests passed (verified offline/configuration mode)");
}

void run();
