import { resolveAppRoute } from "./routes.ts";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

assertEqual(resolveAppRoute("/"), { type: "menu" }, "root route");
assertEqual(resolveAppRoute("///"), { type: "menu" }, "slash-only route");
assertEqual(resolveAppRoute("/play/easy"), { type: "game", difficulty: "Easy" }, "easy route");
assertEqual(resolveAppRoute("/play/medium/"), { type: "game", difficulty: "Medium" }, "medium route with trailing slash");
assertEqual(resolveAppRoute("/play/hard///"), { type: "game", difficulty: "Hard" }, "hard route with trailing slashes");
assertEqual(resolveAppRoute("/daily"), { type: "daily" }, "daily route");
assertEqual(resolveAppRoute("/statistics"), { type: "statistics" }, "statistics route");
assertEqual(resolveAppRoute("/achievements"), { type: "achievements" }, "achievements route");
assertEqual(resolveAppRoute("/leaderboard"), { type: "leaderboard" }, "leaderboard route");
assertEqual(resolveAppRoute("/unknown"), { type: "not-found" }, "unknown route");
assertEqual(resolveAppRoute("/play/extreme"), { type: "not-found" }, "unsupported difficulty");

console.log("App route tests passed.");
