import { ACHIEVEMENTS, type AchievementId, type Profile } from "./achievements.ts";

export type ServerPlayerProgress = {
  total_xp: number | string;
  player_level: number;
  games_completed: number | string;
  tiles_claimed: number | string;
  best_game_score: number;
  daily_challenges_completed: number | string;
  current_daily_streak: number | string;
};

export type ServerAchievementAward = {
  achievement_id: AchievementId;
  unlocked_at: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function count(value: unknown, field: string): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Player progress returned an invalid ${field}.`);
  }
  return parsed;
}

export function profileFromServerData(
  progressValue: unknown,
  awardsValue: unknown
): Profile {
  if (!record(progressValue)) {
    throw new Error("Player progress is unavailable for this account.");
  }
  if (!Array.isArray(awardsValue)) {
    throw new Error("Player achievement awards returned an invalid response.");
  }

  const xp = count(progressValue.total_xp, "total XP");
  const level = count(progressValue.player_level, "player level");
  if (level < 1 || level > 10_000) {
    throw new Error("Player progress returned an invalid player level.");
  }

  const unlocked: Partial<Record<AchievementId, string>> = {};
  for (const award of awardsValue) {
    if (!record(award) || typeof award.achievement_id !== "string" || typeof award.unlocked_at !== "string") {
      throw new Error("Player achievement awards returned an invalid record.");
    }
    const definition = ACHIEVEMENTS.find((item) => item.id === award.achievement_id);
    if (!definition || !Number.isFinite(Date.parse(award.unlocked_at))) {
      throw new Error("Player achievement awards returned an unsupported achievement.");
    }
    unlocked[definition.id] = award.unlocked_at;
  }

  return {
    xp,
    level,
    unlocked,
    progress: {
      tilesClaimed: count(progressValue.tiles_claimed, "tiles claimed"),
      gamesCompleted: count(progressValue.games_completed, "games completed"),
      // The current server schema does not separately track wins or perfect wins.
      // Awarded achievements remain authoritative for these two achievements.
      gamesWon: 0,
      bestGameScore: count(progressValue.best_game_score, "best game score"),
      dailyCompleted: count(progressValue.daily_challenges_completed, "Daily completions"),
      currentStreak: count(progressValue.current_daily_streak, "Daily streak"),
      perfectWins: 0
    }
  };
}
