import assert from "node:assert/strict";
import { resolveAppRoute } from "./routes.ts";

assert.deepEqual(resolveAppRoute("/"), { type: "menu" });
assert.deepEqual(resolveAppRoute("///"), { type: "menu" });
assert.deepEqual(resolveAppRoute("/play/easy"), { type: "game", difficulty: "Easy" });
assert.deepEqual(resolveAppRoute("/play/medium/"), { type: "game", difficulty: "Medium" });
assert.deepEqual(resolveAppRoute("/play/hard///"), { type: "game", difficulty: "Hard" });
assert.deepEqual(resolveAppRoute("/daily"), { type: "daily" });
assert.deepEqual(resolveAppRoute("/statistics"), { type: "statistics" });
assert.deepEqual(resolveAppRoute("/achievements"), { type: "achievements" });
assert.deepEqual(resolveAppRoute("/leaderboard"), { type: "leaderboard" });
assert.deepEqual(resolveAppRoute("/unknown"), { type: "not-found" });
assert.deepEqual(resolveAppRoute("/play/extreme"), { type: "not-found" });

console.log("App route tests passed.");
