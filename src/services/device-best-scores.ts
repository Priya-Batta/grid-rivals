import type { Difficulty } from "../../shared/grid-rivals-rules.ts";

type ScoreStorage = Pick<Storage, "getItem" | "setItem">;

function scoreKey(difficulty: Difficulty, isDailyChallenge: boolean): string {
  return isDailyChallenge
    ? "grid-rivals-daily-best"
    : `grid-rivals-best-${difficulty}`;
}

/** Reads a device-only best score without changing stored data. */
export function readBestScore(
  storage: Pick<Storage, "getItem">,
  difficulty: Difficulty,
  isDailyChallenge = false
): number {
  return Number(storage.getItem(scoreKey(difficulty, isDailyChallenge)) || 0);
}

/** Records a new device-only best score, preserving any higher existing score. */
export function recordBestScore(
  storage: ScoreStorage,
  score: number,
  difficulty: Difficulty,
  isDailyChallenge = false
): number {
  const key = scoreKey(difficulty, isDailyChallenge);
  const oldBest = Number(storage.getItem(key) || 0);
  const best = Math.max(oldBest, score);

  storage.setItem(key, String(best));
  return best;
}

/** Reads the three standard-mode device best scores for the leaderboard. */
export function readStandardBestScores(storage: Pick<Storage, "getItem">) {
  return {
    easy: readBestScore(storage, "Easy"),
    medium: readBestScore(storage, "Medium"),
    hard: readBestScore(storage, "Hard")
  };
}
