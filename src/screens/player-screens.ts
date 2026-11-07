import Phaser from "phaser";
import {
  ACHIEVEMENTS,
  achievementProgress,
  levelProgress,
  type Profile
} from "../achievements";

const FONT = "Arial, Helvetica, sans-serif";

export function renderStatisticsScreen(
  scene: Phaser.Scene,
  onBack: () => void
): void {
  scene.add.text(280, 100, "DEVICE-LOCAL PRACTICE STATISTICS", {
    fontSize: "28px",
    color: "#1e293b",
    fontStyle: "bold"
  }).setOrigin(0.5);

  const easyBest = localStorage.getItem("grid-rivals-best-Easy") || "0";
  const mediumBest = localStorage.getItem("grid-rivals-best-Medium") || "0";
  const hardBest = localStorage.getItem("grid-rivals-best-Hard") || "0";
  const dailyTotal = localStorage.getItem("grid-rivals-daily-total") || "0";
  const streak = localStorage.getItem("grid-rivals-daily-streak") || "0";

  const stats = [
    `EASY BEST: ${easyBest}`,
    `MEDIUM BEST: ${mediumBest}`,
    `HARD BEST: ${hardBest}`,
    `DAILY COMPLETED: ${dailyTotal}`,
    `CURRENT STREAK: ${streak} DAYS`
  ];

  stats.forEach((stat, index) => {
    scene.add.text(280, 200 + index * 65, stat, {
      fontSize: "21px",
      color: "#15803d",
      backgroundColor: "#ffffff",
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5);
  });

  const backButton = scene.add.text(280, 620, "BACK TO MENU", {
    fontSize: "19px",
    color: "#ffffff",
    backgroundColor: "#4f46e5",
    padding: { x: 22, y: 13 }
  })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  backButton.on("pointerdown", onBack);
}

export function renderAchievementsScreen(
  scene: Phaser.Scene,
  profile: Profile,
  onBack: () => void
): void {
  const progress = levelProgress(profile.xp);

  scene.add.rectangle(280, 460, 520, 880, 0xf5f7ff)
    .setStrokeStyle(2, 0xdbe3f3);

  scene.add.text(280, 42, "ACHIEVEMENTS", {
    fontFamily: FONT,
    fontSize: "28px",
    color: "#1e293b",
    fontStyle: "bold"
  }).setOrigin(0.5);

  scene.add.text(280, 72, `LEVEL ${progress.level}  •  ${profile.xp} XP`, {
    fontFamily: FONT,
    fontSize: "15px",
    color: "#d97706",
    fontStyle: "bold"
  }).setOrigin(0.5);

  const barWidth = 280;
  scene.add.rectangle(280, 96, barWidth, 12, 0xdbe3f3)
    .setStrokeStyle(1, 0xe2e8f0);
  const fill = Math.max(0, Math.min(barWidth, (progress.current / progress.needed) * barWidth));
  if (fill > 0) {
    scene.add.rectangle(280 - barWidth / 2 + fill / 2, 96, fill, 8, 0x0ea5e9);
  }
  scene.add.text(280, 114, `${progress.current} / ${progress.needed} TO NEXT LEVEL`, {
    fontFamily: FONT,
    fontSize: "13px",
    color: "#64748b"
  }).setOrigin(0.5);

  const cardH = 84;
  const gap = 4;
  const listTop = 136;

  ACHIEVEMENTS.forEach((achievement, index) => {
    const y = listTop + index * (cardH + gap) + cardH / 2;
    const unlocked = Boolean(profile.unlocked[achievement.id]);
    const serverAwardOnly = achievement.id === "first-victory" || achievement.id === "perfect-strategist";
    const current = achievementProgress(profile, achievement.id);
    const ratio = achievement.goal === 0 ? 1 : current / achievement.goal;

    scene.add.rectangle(280, y, 492, cardH, unlocked ? 0xdcfce7 : 0xeaf0ff)
      .setStrokeStyle(2, unlocked ? 0x6ee7b7 : 0xe2e8f0);

    scene.add.text(50, y - 26, achievement.name.toUpperCase(), {
      fontFamily: FONT,
      fontSize: "16px",
      color: unlocked ? "#166534" : "#475569",
      fontStyle: "bold"
    }).setOrigin(0, 0.5);

    scene.add.text(510, y - 26, `+${achievement.xp} XP`, {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#d97706",
      fontStyle: "bold"
    }).setOrigin(1, 0.5);

    scene.add.text(50, y - 6, achievement.description, {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#64748b"
    }).setOrigin(0, 0.5);

    const trackX = 250;
    const trackW = 110;
    if (!serverAwardOnly) scene.add.rectangle(trackX, y + 20, trackW, 8, 0xdbe3f3);
    const progressWidth = serverAwardOnly ? 0 : Math.max(0, Math.min(trackW, ratio * trackW));
    if (progressWidth > 0) {
      scene.add.rectangle(
        trackX - trackW / 2 + progressWidth / 2,
        y + 20,
        progressWidth,
        6,
        unlocked ? 0x4ade80 : 0x38bdf8
      );
    }

    scene.add.text(314, y + 20, serverAwardOnly ? "SERVER AWARD" : `${current}/${achievement.goal}`, {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#334155"
    }).setOrigin(0, 0.5);

    const date = unlocked
      ? (profile.unlocked[achievement.id] || "").slice(0, 10)
      : "LOCKED";
    scene.add.text(50, y + 20, date, {
      fontFamily: FONT,
      fontSize: "14px",
      color: unlocked ? "#047857" : "#64748b",
      fontStyle: "bold"
    }).setOrigin(0, 0.5);

    scene.add.text(510, y + 20, unlocked ? "UNLOCKED" : "", {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#15803d",
      fontStyle: "bold"
    }).setOrigin(1, 0.5);
  });

  const back = scene.add.text(280, 878, "BACK TO MENU", {
    fontFamily: FONT,
    fontSize: "18px",
    color: "#1e293b",
    backgroundColor: "#2563eb",
    padding: { x: 18, y: 10 }
  })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  back.on("pointerdown", onBack);
  back.on("pointerover", () => back.setBackgroundColor("#3b82f6"));
  back.on("pointerout", () => back.setBackgroundColor("#2563eb"));
}
