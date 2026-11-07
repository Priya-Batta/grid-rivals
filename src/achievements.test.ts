import {
  achievementProgress,
  levelProgress,
  type Profile
} from "./achievements.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function serverProfile(): Profile {
  return {
    xp: 390,
    level: 3,
    unlocked: {},
    progress: {
      tilesClaimed: 50,
      gamesCompleted: 8,
      gamesWon: 0,
      bestGameScore: 240,
      dailyCompleted: 3,
      currentStreak: 2,
      perfectWins: 0
    }
  };
}

function testLevelCurve() {
  assert(levelProgress(0).level === 1, "level starts at 1");
  assert(levelProgress(99).level === 1, "99 XP is still level 1");
  const second = levelProgress(100);
  assert(second.level === 2 && second.current === 0 && second.needed === 200, "100 XP reaches level 2");
  const third = levelProgress(300);
  assert(third.level === 3 && third.current === 0 && third.needed === 300, "300 XP reaches level 3");
}

function testProgressUsesServerViewModel() {
  const profile = serverProfile();
  assert(achievementProgress(profile, "territory-beginner") === 10, "tile progress drives Territory Beginner");
  assert(achievementProgress(profile, "territory-master") === 50, "tile progress drives Territory Master");
  assert(achievementProgress(profile, "high-scorer") === 200, "best score drives High Scorer");
  assert(achievementProgress(profile, "champion") === 240, "best score drives Champion");
  assert(achievementProgress(profile, "daily-player") === 3, "server Daily count drives Daily Player");
  assert(achievementProgress(profile, "streak-master") === 2, "server streak drives Streak Master");
  assert(achievementProgress(profile, "first-victory") === 0, "First Victory progress is award-only");
  assert(achievementProgress(profile, "perfect-strategist") === 0, "Perfect Strategist progress is award-only");
}

function testServerAwardsControlUnlockState() {
  const profile = serverProfile();
  profile.unlocked.champion = "2026-11-07T10:00:00.000Z";
  assert(achievementProgress(profile, "champion") === 240, "server award marks the achievement complete");
  assert(achievementProgress(profile, "first-victory") === 0, "unawarded achievements remain locked");
}

testLevelCurve();
testProgressUsesServerViewModel();
testServerAwardsControlUnlockState();
console.log("achievement view-model tests passed");
