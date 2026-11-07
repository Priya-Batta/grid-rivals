import { readDeviceStatistics } from "./statistics.ts";
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }
function storage(values: Record<string, string>): Pick<Storage, "getItem"> { return { getItem: (key) => values[key] ?? null }; }

const populated = readDeviceStatistics(storage({
  "grid-rivals-best-Easy": "120", "grid-rivals-best-Medium": "240",
  "grid-rivals-best-Hard": "360", "grid-rivals-daily-total": "8",
  "grid-rivals-daily-streak": "3"
}));
assert(populated.easyBest === 120, "reads Easy local best");
assert(populated.mediumBest === 240, "reads Medium local best");
assert(populated.hardBest === 360, "reads Hard local best");
assert(populated.dailyCompleted === 8, "reads local Daily total");
assert(populated.dailyStreak === 3, "reads local Daily streak");

const invalid = readDeviceStatistics(storage({
  "grid-rivals-best-Easy": "-5", "grid-rivals-best-Medium": "not-a-number",
  "grid-rivals-best-Hard": "1.5", "grid-rivals-daily-total": "9007199254740992"
}));
assert(Object.values(invalid).every((value) => value === 0), "invalid or unsafe values default to zero");
assert(Object.values(readDeviceStatistics(storage({}))).every((value) => value === 0), "missing values default to zero");

let readCount = 0;
const unavailable = readDeviceStatistics({ getItem: () => { readCount += 1; throw new Error("storage unavailable"); } });
assert(readCount === 1, "storage errors are caught");
assert(Object.values(unavailable).every((value) => value === 0), "storage errors have safe defaults");
console.log("device statistics tests passed");
