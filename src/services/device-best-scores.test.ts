import {
  readBestScore,
  recordBestScore,
  readStandardBestScores
} from "./device-best-scores.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function storage(initial: Record<string, string> = {}) {
  const values = { ...initial };

  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    }
  };
}

const device = storage({
  "grid-rivals-best-Easy": "120",
  "grid-rivals-best-Medium": "240",
  "grid-rivals-best-Hard": "360",
  "grid-rivals-daily-best": "180"
});

assert(readBestScore(device, "Easy") === 120, "reads Easy best");
assert(readBestScore(device, "Medium") === 240, "reads Medium best");
assert(readBestScore(device, "Hard") === 360, "reads Hard best");
assert(readBestScore(device, "Easy", true) === 180, "reads Daily best");

const standard = readStandardBestScores(device);
assert(standard.easy === 120, "leaderboard reads Easy best");
assert(standard.medium === 240, "leaderboard reads Medium best");
assert(standard.hard === 360, "leaderboard reads Hard best");

assert(recordBestScore(device, 100, "Easy") === 120, "preserves higher existing best");
assert(device.values["grid-rivals-best-Easy"] === "120", "does not lower stored best");

assert(recordBestScore(device, 150, "Easy") === 150, "records a new standard best");
assert(device.values["grid-rivals-best-Easy"] === "150", "writes standard best");

assert(recordBestScore(device, 200, "Hard", true) === 200, "records a Daily best");
assert(device.values["grid-rivals-daily-best"] === "200", "writes Daily best");

const empty = storage();
assert(readBestScore(empty, "Medium") === 0, "missing best defaults to zero");

console.log("device best score tests passed");
