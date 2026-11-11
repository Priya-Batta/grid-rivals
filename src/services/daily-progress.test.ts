import { recordDailyCompletion } from "./daily-progress.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    get(key: string) {
      return values.get(key);
    }
  };
}

function testFirstCompletion() {
  const storage = createStorage();

  const streak = recordDailyCompletion(storage, "2026-11-11");

  assert(streak === 1, "first completion starts a streak of one");
  assert(storage.get("grid-rivals-last-daily") === "2026-11-11", "first completion stores the date");
  assert(storage.get("grid-rivals-daily-streak") === "1", "first completion stores the streak");
  assert(storage.get("grid-rivals-daily-total") === "1", "first completion increments the total");
}

function testSameDayRepeat() {
  const storage = createStorage({
    "grid-rivals-last-daily": "2026-11-11",
    "grid-rivals-daily-streak": "3",
    "grid-rivals-daily-total": "8"
  });

  const streak = recordDailyCompletion(storage, "2026-11-11");

  assert(streak === 3, "same-day completion preserves the streak");
  assert(storage.get("grid-rivals-daily-total") === "8", "same-day completion does not increment the total");
}

function testConsecutiveDay() {
  const storage = createStorage({
    "grid-rivals-last-daily": "2026-11-10",
    "grid-rivals-daily-streak": "3",
    "grid-rivals-daily-total": "8"
  });

  const streak = recordDailyCompletion(storage, "2026-11-11");

  assert(streak === 4, "consecutive completion increments the streak");
  assert(storage.get("grid-rivals-daily-total") === "9", "new daily completion increments the total");
}

function testMissedDay() {
  const storage = createStorage({
    "grid-rivals-last-daily": "2026-11-09",
    "grid-rivals-daily-streak": "5",
    "grid-rivals-daily-total": "8"
  });

  const streak = recordDailyCompletion(storage, "2026-11-11");

  assert(streak === 1, "missing a day resets the streak");
  assert(storage.get("grid-rivals-daily-total") === "9", "completion after a missed day increments the total");
}

testFirstCompletion();
testSameDayRepeat();
testConsecutiveDay();
testMissedDay();

console.log("daily progress tests passed");
