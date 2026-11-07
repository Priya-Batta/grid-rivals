import {
  achievementProgress,
  gameRewardXp,
  levelProgress,
  loadProfile,
  recordGameCompletion,
  recordTileClaim,
  type Profile
} from "./achievements.ts";

const store = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key)
  },
  configurable: true
});

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function freshProfile(): Profile {
  store.clear();
  return loadProfile().profile;
}

function testLevelCurve() {
  assert(levelProgress(0).level === 1, "level starts at 1");
  assert(levelProgress(99).level === 1, "99 XP is still level 1");
  const second = levelProgress(100);
  assert(second.level === 2 && second.current === 0 && second.needed === 200, "100 XP reaches level 2");
  const third = levelProgress(300);
  assert(third.level === 3 && third.current === 0 && third.needed === 300, "300 XP reaches level 3");
}

function testGameXp() {
  assert(gameRewardXp(0, false) === 20, "base XP");
  assert(gameRewardXp(250, false) === 45, "score XP");
  assert(gameRewardXp(250, true) === 85, "daily bonus XP");
}

function testFirstVictoryOnce() {
  const profile = freshProfile();
  const first = recordGameCompletion(profile, 80, false, 0, 0);
  assert(!first.unlocks.includes("first-victory"), "a completed loss does not unlock First Victory");
  assert(first.gameXp === 28, "game XP is awarded");
  assert(profile.xp === 28, "loss awards only game XP");
  const firstWin = recordGameCompletion(profile, 200, false, 0, 0, 0);
  assert(firstWin.unlocks.includes("first-victory"), "first win unlocks First Victory");
  const firstUnlockDate = profile.unlocked["first-victory"];
  assert(Boolean(firstUnlockDate), "achievement unlock date is recorded");
  const xpAfter = profile.xp;
  const second = recordGameCompletion(profile, 80, false, 0, 0);
  assert(!second.unlocks.includes("first-victory"), "First Victory is not repeated");
  assert(profile.xp === xpAfter + second.gameXp, "only a new game reward is added");
  assert(loadProfile().profile.unlocked["first-victory"] === firstUnlockDate, "unlock date persists");
}

function testTiles() {
  const profile = freshProfile();
  let beginner = false;
  let master = false;
  for (let i = 0; i < 50; i += 1) {
    const unlocks = recordTileClaim(profile, 10);
    if (unlocks.includes("territory-beginner")) beginner = true;
    if (unlocks.includes("territory-master")) master = true;
  }
  assert(beginner, "10 claims unlock Territory Beginner");
  assert(master, "50 claims unlock Territory Master");
  assert(profile.xp === 140, "territory achievement XP is awarded once each");
  const before = profile.xp;
  recordTileClaim(profile, 10);
  assert(profile.xp === before, "extra claims do not pay the reward again");
  assert(achievementProgress(profile, "territory-master") === 50, "master progress is complete");
}

function testScores() {
  const profile = freshProfile();
  const high = recordTileClaim(profile, 200);
  assert(high.includes("high-scorer"), "200 points unlocks High Scorer");
  assert(!high.includes("champion"), "200 points does not unlock Champion");
  const before = profile.xp;
  recordTileClaim(profile, 200);
  assert(profile.xp === before, "High Scorer XP is paid once");
  const champion = recordTileClaim(profile, 240);
  assert(champion.includes("champion"), "320 points unlocks Champion");
  assert(profile.xp === 230, "score achievement XP is awarded once each");
}

function testDailyAndStreak() {
  const profile = freshProfile();
  recordGameCompletion(profile, 100, true, 1, 1);
  recordGameCompletion(profile, 100, true, 2, 2);
  const third = recordGameCompletion(profile, 100, true, 3, 3);
  assert(third.unlocks.includes("daily-player"), "3 dailies unlock Daily Player");
  const before = profile.xp;
  recordGameCompletion(profile, 100, true, 3, 6);
  assert(!recordGameCompletion(profile, 100, true, 3, 7).unlocks.includes("daily-player"), "daily reward stays unique");
  assert(profile.xp > before, "streak master and game XP can still be awarded");
  const reloaded = loadProfile().profile;
  assert(Boolean(reloaded.unlocked["daily-player"]), "daily unlock persists");
  assert(Boolean(reloaded.unlocked["streak-master"]), "streak unlock persists");
  assert(reloaded.xp === profile.xp, "XP persists");
  assert(reloaded.level === levelProgress(profile.xp).level, "level persists");
}

function testPerfectStrategist() {
  const profile = freshProfile();
  const scoreOnly = recordTileClaim(profile, 200);
  assert(!scoreOnly.includes("perfect-strategist"), "score alone does not count as a win");
  const belowTarget = recordGameCompletion(profile, 190, false, 0, 0, 3).unlocks;
  assert(!belowTarget.includes("perfect-strategist"), "a sub-target game does not count as a win");
  const ordinaryWin = recordGameCompletion(profile, 200, false, 0, 0, 0).unlocks;
  assert(!ordinaryWin.includes("perfect-strategist"), "a normal victory does not unlock Perfect Strategist");
  const perfectWin = recordGameCompletion(profile, 300, false, 0, 0, 0).unlocks;
  assert(perfectWin.includes("perfect-strategist"), "a 300-point victory after all moves unlocks Perfect Strategist");
const before = profile.xp;
const secondWin = recordGameCompletion(profile, 320, false, 0, 0, 0);

assert(
  !secondWin.unlocks.includes("perfect-strategist"),
  "Perfect Strategist is not unlocked twice"
);

assert(
  !secondWin.unlocks.includes("champion"),
  "an already unlocked Champion reward is not repeated"
);

assert(
  profile.xp === before + gameRewardXp(320, false),
  "only the new game XP is awarded"
);
}

function testExistingSave() {
  store.clear();
  localStorage.setItem("grid-rivals-best-Hard", "500");
  localStorage.setItem("grid-rivals-daily-total", "3");
  localStorage.setItem("grid-rivals-daily-streak", "7");
  const loaded = loadProfile();
  assert(!loaded.freshUnlocks.includes("first-victory"), "existing best does not prove a first victory");
  assert(loaded.freshUnlocks.includes("high-scorer"), "existing 500 best unlocks High Scorer");
  assert(loaded.freshUnlocks.includes("daily-player"), "existing daily total unlocks Daily Player");
  assert(loaded.freshUnlocks.includes("streak-master"), "existing streak unlocks Streak Master");
  const again = loadProfile();
  assert(again.freshUnlocks.length === 0, "reloading does not grant rewards again");
  assert(again.profile.xp === loaded.profile.xp, "migrated XP stays stable");
}

testLevelCurve();
testGameXp();
testFirstVictoryOnce();
testTiles();
testScores();
testDailyAndStreak();
testPerfectStrategist();
testExistingSave();
console.log("achievement tests passed");
