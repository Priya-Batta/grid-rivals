import type { Difficulty } from "../../supabase/functions/_shared/grid-rivals-rules.ts";

export type AppRoute =
  | { type: "menu" }
  | { type: "game"; difficulty: Difficulty }
  | { type: "daily" }
  | { type: "statistics" }
  | { type: "achievements" }
  | { type: "leaderboard" }
  | { type: "not-found" };

export function resolveAppRoute(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return { type: "menu" };

  const gameMatch = path.match(/^\/play\/(easy|medium|hard)$/);
  if (gameMatch) {
    const difficulty = gameMatch[1];
    return {
      type: "game",
      difficulty: (difficulty[0].toUpperCase() + difficulty.slice(1)) as Difficulty
    };
  }

  switch (path) {
    case "/daily":
      return { type: "daily" };
    case "/statistics":
      return { type: "statistics" };
    case "/achievements":
      return { type: "achievements" };
    case "/leaderboard":
      return { type: "leaderboard" };
    default:
      return { type: "not-found" };
  }
}
