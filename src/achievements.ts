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

const STORAGE_KEY = "grid-rivals-profile";
export const WIN_SCORE = 200;

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

export function gameRewardXp(score: number, isDaily: boolean): number {
  const base = 20 + Math.floor(Math.max(0, score) / 10);
  return base + (isDaily ? 40 : 0);
}

export function achievementById(id: AchievementId): AchievementDef {
  const found = ACHIEVEMENTS.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Unknown achievement: ${id}`);
  }
  return found;
}

export function achievementProgress(profile: Profile, id: AchievementId): number {
  const goal = achievementById(id).goal;
  const progress = profile.progress;

  if (profile.unlocked[id]) return goal;

  const current = {
    "first-victory": progress.gamesWon,
    "territory-beginner": progress.tilesClaimed,
    "territory-master": progress.tilesClaimed,
    "high-scorer": progress.bestGameScore,
    "champion": progress.bestGameScore,
    "daily-player": progress.dailyCompleted,
    "streak-master": progress.currentStreak,
    "perfect-strategist": progress.perfectWins
  }[id];

  return Math.max(0, Math.min(goal, current));
}

function emptyProfile(): Profile {
  return {
    xp: 0,
    level: 1,
    unlocked: {},
    progress: {
      tilesClaimed: 0,
      gamesCompleted: 0,
      gamesWon: 0,
      bestGameScore: 0,
      dailyCompleted: 0,
      currentStreak: 0,
      perfectWins: 0
    }
  };
}

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key) || 0) || 0;
  } catch {
    return 0;
  }
}

function legacySnapshot() {
  const bests = [
    readNumber("grid-rivals-best-Easy"),
    readNumber("grid-rivals-best-Medium"),
    readNumber("grid-rivals-best-Hard"),
    readNumber("grid-rivals-daily-best")
  ];

  return {
    best: Math.max(0, ...bests),
    dailyTotal: readNumber("grid-rivals-daily-total"),
    streak: readNumber("grid-rivals-daily-streak")
  };
}

function persist(profile: Profile) {
  profile.level = levelProgress(profile.xp).level;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn("Could not save player profile:", error);
  }
}

function tryUnlock(profile: Profile, id: AchievementId, unlocks: AchievementId[]) {
  if (profile.unlocked[id]) return;
  if (achievementProgress(profile, id) < achievementById(id).goal) return;

  profile.unlocked[id] = new Date().toISOString();
  profile.xp += achievementById(id).xp;
  unlocks.push(id);
}

function evaluate(profile: Profile): AchievementId[] {
  const unlocks: AchievementId[] = [];
  for (const achievement of ACHIEVEMENTS) {
    tryUnlock(profile, achievement.id, unlocks);
  }
  return unlocks;
}

function applyLegacy(profile: Profile) {
  const legacy = legacySnapshot();
  profile.progress.bestGameScore = Math.max(profile.progress.bestGameScore, legacy.best);
  profile.progress.dailyCompleted = Math.max(profile.progress.dailyCompleted, legacy.dailyTotal);
  profile.progress.currentStreak = Math.max(profile.progress.currentStreak, legacy.streak);

  if (profile.progress.gamesCompleted === 0 && (legacy.best > 0 || legacy.dailyTotal > 0)) {
    profile.progress.gamesCompleted = 1;
  }
}

function normalize(value: unknown): Profile {
  const profile = emptyProfile();
  if (!value || typeof value !== "object") return profile;

  const raw = value as Partial<Profile>;
  profile.xp = Math.max(0, Number(raw.xp) || 0);
  profile.level = Math.max(1, Number(raw.level) || 1);

  if (raw.unlocked && typeof raw.unlocked === "object") {
    for (const achievement of ACHIEVEMENTS) {
      const date = raw.unlocked[achievement.id];
      if (typeof date === "string" && date.length > 0) {
        profile.unlocked[achievement.id] = date;
      }
    }
  }

  const progress = raw.progress;
  if (progress && typeof progress === "object") {
    profile.progress.tilesClaimed = Math.max(0, Number(progress.tilesClaimed) || 0);
    profile.progress.gamesCompleted = Math.max(0, Number(progress.gamesCompleted) || 0);
    profile.progress.gamesWon = Math.max(0, Number(progress.gamesWon) || 0);
    profile.progress.bestGameScore = Math.max(0, Number(progress.bestGameScore) || 0);
    profile.progress.dailyCompleted = Math.max(0, Number(progress.dailyCompleted) || 0);
    profile.progress.currentStreak = Math.max(0, Number(progress.currentStreak) || 0);
    profile.progress.perfectWins = Math.max(0, Number(progress.perfectWins) || 0);
  }

  return profile;
}

export function loadProfile(): { profile: Profile; freshUnlocks: AchievementId[] } {
  let profile = emptyProfile();

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) profile = normalize(JSON.parse(saved));
  } catch (error) {
    console.warn("Could not read player profile:", error);
    profile = emptyProfile();
  }

  applyLegacy(profile);
  const freshUnlocks = evaluate(profile);
  profile.level = levelProgress(profile.xp).level;
  persist(profile);

  return { profile, freshUnlocks };
}

export function recordTileClaim(
  profile: Profile,
  score: number
): AchievementId[] {
  profile.progress.tilesClaimed += 1;
  profile.progress.bestGameScore = Math.max(profile.progress.bestGameScore, score);

  const unlocks = evaluate(profile);
  persist(profile);
  return unlocks;
}

export function recordGameCompletion(
  profile: Profile,
  score: number,
  isDaily: boolean,
  dailyTotal: number,
  streak: number,
  movesRemaining = 0
): { gameXp: number; unlocks: AchievementId[] } {
  profile.progress.gamesCompleted += 1;
  if (score >= WIN_SCORE) profile.progress.gamesWon += 1;
  profile.progress.bestGameScore = Math.max(profile.progress.bestGameScore, score);
  profile.progress.dailyCompleted = Math.max(profile.progress.dailyCompleted, dailyTotal);
  profile.progress.currentStreak = Math.max(0, streak);

  if (score >= 300 && movesRemaining === 0) {
    profile.progress.perfectWins = Math.max(1, profile.progress.perfectWins);
  }

  const gameXp = gameRewardXp(score, isDaily);
  profile.xp += gameXp;

  const unlocks = evaluate(profile);
  persist(profile);

  return { gameXp, unlocks };
}
