export type AchievementId =
  | "first-victory"
  | "territory-beginner"
  | "territory-master"
  | "high-scorer"
  | "champion"
  | "daily-player"
  | "streak-master"
  | "perfect-strategist";

export type AchievementDef = {
  id: AchievementId;
  name: string;
  description: string;
  xp: number;
  goal: number;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-victory",
    name: "First Victory",
    description: "Win your first game.",
    xp: 50,
    goal: 1
  },
  {
    id: "territory-beginner",
    name: "Territory Beginner",
    description: "Claim 10 tiles.",
    xp: 40,
    goal: 10
  },
  {
    id: "territory-master",
    name: "Territory Master",
    description: "Claim 50 tiles.",
    xp: 100,
    goal: 50
  },
  {
    id: "high-scorer",
    name: "High Scorer",
    description: "Reach 200 points in one game.",
    xp: 80,
    goal: 200
  },
  {
    id: "champion",
    name: "Champion",
    description: "Reach 240 points in one game.",
    xp: 150,
    goal: 240
  },
  {
    id: "daily-player",
    name: "Daily Player",
    description: "Complete 3 daily challenges.",
    xp: 60,
    goal: 3
  },
  {
    id: "streak-master",
    name: "Streak Master",
    description: "Maintain a 7-day daily challenge streak.",
    xp: 120,
    goal: 7
  },
  {
    id: "perfect-strategist",
    name: "Perfect Strategist",
    description: "Reach 300 points after using all moves.",
    xp: 90,
    goal: 1
  }
];

export type Profile = {
  xp: number;
  level: number;
  unlocked: Partial<Record<AchievementId, string>>;
  progress: {
    tilesClaimed: number;
    gamesCompleted: number;
    gamesWon: number;
    bestGameScore: number;
    dailyCompleted: number;
    currentStreak: number;
    perfectWins: number;
  };
};

export type LevelProgress = {
  level: number;
  current: number;
  needed: number;
};

export function levelProgress(xp: number): LevelProgress {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  let needed = 100;

  while (level < 10_000 && rest >= needed) {
    rest -= needed;
    level += 1;
    needed = 100 * level;
  }

  return { level, current: rest, needed };
}

export function achievementById(id: AchievementId): AchievementDef {
  const found = ACHIEVEMENTS.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Unknown achievement: ${id}`);
  }
  return found;
}

/**
 * Derives display progress from the server-backed profile view model.
 * Achievement unlocks themselves are supplied only by server award records.
 */
export function achievementProgress(profile: Profile, id: AchievementId): number {
  const goal = achievementById(id).goal;
  if (profile.unlocked[id]) return goal;

  const progress = profile.progress;
  const current = {
    "first-victory": 0,
    "territory-beginner": progress.tilesClaimed,
    "territory-master": progress.tilesClaimed,
    "high-scorer": progress.bestGameScore,
    "champion": progress.bestGameScore,
    "daily-player": progress.dailyCompleted,
    "streak-master": progress.currentStreak,
    "perfect-strategist": 0
  }[id];

  return Math.max(0, Math.min(goal, current));
}
