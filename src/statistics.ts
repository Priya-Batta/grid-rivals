import { readStandardBestScores } from "./services/device-best-scores.ts";

export type DeviceStatistics = {
  easyBest: number;
  mediumBest: number;
  hardBest: number;
  dailyCompleted: number;
  dailyStreak: number;
};

function nonNegativeInteger(value: string | null): number {
  if (value === null || value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeBestScore(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Reads legacy device-only records without modifying or migrating them. */
export function readDeviceStatistics(storage?: Pick<Storage, "getItem">): DeviceStatistics {
  try {
    const source = storage ?? globalThis.localStorage;
    const bestScores = readStandardBestScores(source);
    return {
      easyBest: safeBestScore(bestScores.easy),
      mediumBest: safeBestScore(bestScores.medium),
      hardBest: safeBestScore(bestScores.hard),
      dailyCompleted: nonNegativeInteger(source.getItem("grid-rivals-daily-total")),
      dailyStreak: nonNegativeInteger(source.getItem("grid-rivals-daily-streak"))
    };
  } catch {
    return { easyBest: 0, mediumBest: 0, hardBest: 0, dailyCompleted: 0, dailyStreak: 0 };
  }
}
