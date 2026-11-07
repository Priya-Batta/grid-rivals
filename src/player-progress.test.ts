import { profileFromServerData } from "./player-progress.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const base = {
  total_xp: "390",
  player_level: 3,
  games_completed: "8",
  tiles_claimed: "50",
  best_game_score: 240,
  daily_challenges_completed: "3",
  current_daily_streak: "2"
};

function testServerProfileMapping() {
  const profile = profileFromServerData(base, [
    { achievement_id: "territory-master", unlocked_at: "2026-11-06T10:00:00.000Z" },
    { achievement_id: "champion", unlocked_at: "2026-11-07T10:00:00.000Z" }
  ]);
  assert(profile.xp === 390, "server XP is used");
  assert(profile.level === 3, "server level is used");
  assert(profile.progress.gamesCompleted === 8, "server game count is used");
  assert(profile.progress.tilesClaimed === 50, "server tile count is used");
  assert(profile.progress.bestGameScore === 240, "server best score is used");
  assert(profile.progress.dailyCompleted === 3, "server Daily count is used");
  assert(profile.progress.currentStreak === 2, "server Daily streak is used");
  assert(profile.unlocked["territory-master"]?.startsWith("2026-11-06"), "award timestamp is retained");
  assert(profile.unlocked.champion?.startsWith("2026-11-07"), "all server awards are mapped");
  assert(!profile.unlocked["first-victory"], "unawarded achievements remain locked");
}

function testEmptyAwards() {
  const profile = profileFromServerData({ ...base, total_xp: 0, player_level: 1 }, []);
  assert(Object.keys(profile.unlocked).length === 0, "empty award list maps to no unlocked achievements");
}

function testRejectsInvalidProgress() {
  let rejected = false;
  try {
    profileFromServerData({ ...base, total_xp: -1 }, []);
  } catch {
    rejected = true;
  }
  assert(rejected, "negative server XP is rejected");
}

function testRejectsUnknownAward() {
  let rejected = false;
  try {
    profileFromServerData(base, [{ achievement_id: "unknown", unlocked_at: "2026-11-07T10:00:00.000Z" }]);
  } catch {
    rejected = true;
  }
  assert(rejected, "unknown server awards are rejected");
}

testServerProfileMapping();
testEmptyAwards();
testRejectsInvalidProgress();
testRejectsUnknownAward();
console.log("player progress tests passed");
