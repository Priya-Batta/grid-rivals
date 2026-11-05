
import Phaser from "phaser";
import "./style.css";
import {
  applyMove,
  createDailyGameConfig,
  createGameState,
  createStandardGameConfig,
  isValidMove,
  type Difficulty,
  type GameConfig,
  type GameState,
  WIN_SCORE
} from "../supabase/functions/_shared/grid-rivals-rules.ts";
import { LeaderboardView } from "./leaderboard-ui";
import {
  refreshLeaderboardData,
  startVerifiedGame,
  submitVerifiedGame,
  type StartGameMode,
  type StartedGameRun
} from "./leaderboard";
import {
  ACHIEVEMENTS,
  achievementById,
  achievementProgress,
  levelProgress,
  loadProfile,
  recordGameCompletion,
  recordTileClaim,
  type AchievementId,
  type Profile
} from "./achievements";

type Tile = {
  x: number;
  y: number;
  value: number;
  claimed: boolean;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

class GameScene extends Phaser.Scene {
  private grid: Tile[][] = [];
  private rulesState: GameState | undefined;
  private score = 0;
  private moves = 12;
  private difficulty: Difficulty = "Medium";
  private gameOver = false;
  private isDailyChallenge = false;
  private dailyStreak = 0;
  private soundEnabled = localStorage.getItem("grid-rivals-sound") !== "off";
  private profile!: Profile;
  private toastQueue: AchievementId[] = [];
  private toastActive = false;
  private toastGeneration = 0;
  private currentGameRun: StartedGameRun | null = null;
  private submissionInFlight = false;
  private submissionRetryAvailable = false;
  private leaderboardView: LeaderboardView | null = null;
  private scoreSubmissionText?: Phaser.GameObjects.Text;
  private finalScoreText?: Phaser.GameObjects.Text;
  private serverProgressText?: Phaser.GameObjects.Text;

  private readonly onlineHandler = () => {
    if (this.submissionRetryAvailable && this.scoreSubmissionText?.active) {
      this.scoreSubmissionText
        .setText("CONNECTION RESTORED · TAP TO RETRY")
        .setColor("#fbbf24");
    }
  };

  private scoreText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;

  private readonly viewW = 560;
  private readonly viewH = 920;
  private readonly gap = 4;
  private readonly cell = 63;
  private readonly gridSpan = 8 * 63 + 7 * 4;
  private readonly startX = (560 - (8 * 63 + 7 * 4)) / 2;
  private readonly startY = 312;

  constructor() {
    super("GameScene");
  }

  create() {
    window.addEventListener("online", this.onlineHandler);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener("online", this.onlineHandler);
    });

    const loaded = loadProfile();
    this.profile = loaded.profile;
    this.showMenu();
    this.presentUnlocks(loaded.freshUnlocks);
  }

  private clearScreen() {
    this.leaderboardView?.destroy();
    this.leaderboardView = null;
    this.scoreSubmissionText = undefined;
    this.finalScoreText = undefined;
    this.serverProgressText = undefined;
    this.currentGameRun = null;
    this.submissionRetryAvailable = false;
    this.toastGeneration += 1;
    this.toastActive = false;
    this.toastQueue = [];
    this.children.removeAll();
    this.grid = [];
    this.score = 0;
    this.gameOver = false;
  }

  private startDailyChallenge() {
    this.isDailyChallenge = true;
    this.difficulty = "Medium";
    this.startGame();
  }

  private recordDailyCompletion() {
    const today = new Date().toISOString().slice(0, 10);

    const lastPlayed = localStorage.getItem("grid-rivals-last-daily");
    let streak = Number(localStorage.getItem("grid-rivals-daily-streak") || 0);

    if (lastPlayed !== today) {
      if (lastPlayed) {
        const previousDate = new Date(lastPlayed + "T00:00:00Z");
        const currentDate = new Date(today + "T00:00:00Z");

        const difference = Math.round(
          (currentDate.getTime() - previousDate.getTime()) / 86400000
        );

        streak = difference === 1 ? streak + 1 : 1;
      } else {
        streak = 1;
      }

      localStorage.setItem("grid-rivals-last-daily", today);
      localStorage.setItem("grid-rivals-daily-streak", String(streak));

      const total = Number(
        localStorage.getItem("grid-rivals-daily-total") || 0
      );

      localStorage.setItem("grid-rivals-daily-total", String(total + 1));
    }

    this.dailyStreak = streak;
  }

  private showStatistics() {
    this.clearScreen();

    this.add.text(280, 100, "PLAYER STATISTICS", {
      fontSize: "26px",
      color: "#ffffff",
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
      this.add.text(280, 200 + index * 65, stat, {
        fontSize: "19px",
        color: "#4ade80",
        backgroundColor: "#172033",
        padding: { x: 20, y: 12 }
      }).setOrigin(0.5);
    });

    const backButton = this.add.text(280, 620, "BACK TO MENU", {
      fontSize: "17px",
      color: "#ffffff",
      backgroundColor: "#2563eb",
      padding: { x: 22, y: 13 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    backButton.on("pointerdown", () => this.showMenu());
  }

  private showMenu() {
    this.isDailyChallenge = false;
    this.clearScreen();

    // Background decoration
    this.add.rectangle(280, 460, 520, 880, 0x0f172a)
      .setStrokeStyle(2, 0x1e293b);

    this.add.rectangle(280, 176, 150, 4, 0x22d3ee);
    this.drawLevelBar(280, 204, 280);

    // Game title
    this.add.text(280, 95, "GRID RIVALS", {
      fontSize: "40px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this.add.text(280, 145, "CONQUER THE GRID", {
      fontSize: "13px",
      color: "#22d3ee",
      letterSpacing: 4
    }).setOrigin(0.5);

    this.add.text(280, 268, "CHOOSE YOUR GAME", {
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    // Difficulty buttons
    const modes: Difficulty[] = ["Easy", "Medium", "Hard"];

    const modeColors = [
      { normal: 0x166534, hover: 0x15803d },
      { normal: 0x1e40af, hover: 0x2563eb },
      { normal: 0x991b1b, hover: 0xdc2626 }
    ];

    modes.forEach((mode, index) => {
      const y = 320 + index * 78;
      const colors = modeColors[index];

      const button = this.add.rectangle(
        280, y, 250, 56, colors.normal
      )
        .setStrokeStyle(2, 0x475569)
        .setInteractive({ useHandCursor: true });

      this.add.text(280, y, mode.toUpperCase(), {
        fontSize: "19px",
        color: "#ffffff",
        fontStyle: "bold"
      }).setOrigin(0.5);

      button.on("pointerdown", () => {
        this.isDailyChallenge = false;
        this.difficulty = mode;
        void this.startGame();
      });

      button.on("pointerover", () => {
        button.setFillStyle(colors.hover);
      });

      button.on("pointerout", () => {
        button.setFillStyle(colors.normal);
      });
    });

    // Daily Challenge button
    const dailyButton = this.add.rectangle(
      280, 580, 290, 62, 0x047857
    )
      .setStrokeStyle(2, 0x34d399)
      .setInteractive({ useHandCursor: true });

    this.add.text(280, 580, "★  DAILY CHALLENGE", {
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    dailyButton.on("pointerdown", () => {
      this.startDailyChallenge();
    });

    dailyButton.on("pointerover", () => {
      dailyButton.setFillStyle(0x059669);
    });

    dailyButton.on("pointerout", () => {
      dailyButton.setFillStyle(0x047857);
    });

    // Player Statistics button
    const statsButton = this.add.rectangle(
      280, 656, 250, 48, 0x5b21b6
    )
      .setStrokeStyle(2, 0xa78bfa)
      .setInteractive({ useHandCursor: true });

    this.add.text(280, 656, "PLAYER STATISTICS", {
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    statsButton.on("pointerdown", () => {
      this.showStatistics();
    });

    statsButton.on("pointerover", () => {
      statsButton.setFillStyle(0x7c3aed);
    });

    statsButton.on("pointerout", () => {
      statsButton.setFillStyle(0x5b21b6);
    });

    const achievementsButton = this.add.rectangle(
      280, 724, 290, 48, 0x0e7490
    )
      .setStrokeStyle(2, 0x22d3ee)
      .setInteractive({ useHandCursor: true });

    this.add.text(280, 724, "ACHIEVEMENTS", {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    achievementsButton.on("pointerdown", () => this.showAchievements());
    achievementsButton.on("pointerover", () => achievementsButton.setFillStyle(0x0891b2));
    achievementsButton.on("pointerout", () => achievementsButton.setFillStyle(0x0e7490));

    const leaderboardButton = this.add.rectangle(
      280, 780, 290, 48, 0x92400e
    )
      .setStrokeStyle(2, 0xfbbf24)
      .setInteractive({ useHandCursor: true });

    this.add.text(280, 780, "GLOBAL LEADERBOARD", {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    leaderboardButton.on("pointerdown", () => this.showLeaderboard());
    leaderboardButton.on("pointerover", () => leaderboardButton.setFillStyle(0xb45309));
    leaderboardButton.on("pointerout", () => leaderboardButton.setFillStyle(0x92400e));

    // Sound ON/OFF button
    const soundButton = this.add.text(
      280,
      840,
      this.soundEnabled ? "SOUND: ON" : "SOUND: OFF",
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#334155",
        padding: { x: 22, y: 14 }
      }
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    soundButton.on("pointerover", () => {
      soundButton.setBackgroundColor("#475569");
    });

    soundButton.on("pointerout", () => {
      soundButton.setBackgroundColor("#334155");
    });

    soundButton.on("pointerdown", () => {
      this.soundEnabled = !this.soundEnabled;

      localStorage.setItem(
        "grid-rivals-sound",
        this.soundEnabled ? "on" : "off"
      );

      soundButton.setText(
        this.soundEnabled ? "SOUND: ON" : "SOUND: OFF"
      );
    });

    // Footer
    this.add.text(280, 894, "CAPTURE  •  EXPAND  •  CONQUER", {
      fontSize: "12px",
      color: "#64748b",
      letterSpacing: 2
    }).setOrigin(0.5);
  }

  private async startGame() {
    this.clearScreen();
    const mode: StartGameMode = this.isDailyChallenge ? "daily" : "standard";
    const difficulty = this.difficulty;
    this.add.rectangle(280, 460, 520, 880, 0x0f172a).setStrokeStyle(2, 0x1e293b);
    this.add.text(280, 440, "STARTING VERIFIED RUN...", {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "16px",
      color: "#22d3ee",
      fontStyle: "bold"
    }).setOrigin(0.5);

    let run: StartedGameRun | null = null;
    let config: GameConfig | null = null;
    try {
      run = await startVerifiedGame(mode, difficulty);
      config = run.mode === "daily"
        ? createDailyGameConfig(run.dailyDate || "")
        : createStandardGameConfig(run.difficulty, run.seed);
    } catch (error) {
      console.warn("Starting local practice game:", error);
      config = mode === "daily"
        ? createDailyGameConfig(new Date().toISOString().slice(0, 10))
        : createStandardGameConfig(difficulty, this.newGameSeed());
    }

    this.clearScreen();
    this.currentGameRun = run;
    this.rulesState = createGameState(config);

    this.moves = this.rulesState.movesRemaining;

    const cx = this.viewW / 2;
    const hudY = 248;
    const hudW = this.gridSpan;

    this.add.rectangle(cx, hudY, hudW, 52, 0x111827)
      .setStrokeStyle(2, 0x1e293b);

    this.add.text(cx, 168, "GRID RIVALS", {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "34px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this.add.text(
      cx,
      204,
      this.currentGameRun
        ? this.isDailyChallenge ? "DAILY CHALLENGE" : this.difficulty.toUpperCase() + " MODE"
        : "PRACTICE MODE · NOT VERIFIED",
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: "13px",
        color: "#4ade80",
        letterSpacing: 2
      }
    ).setOrigin(0.5);

    this.scoreText = this.add.text(this.startX + 16, hudY, "SCORE: 0", {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "16px",
      color: "#60a5fa",
      fontStyle: "bold"
    }).setOrigin(0, 0.5);

    this.movesText = this.add.text(cx, hudY, `MOVES: ${this.moves}`, {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "16px",
      color: "#fbbf24",
      fontStyle: "bold"
    }).setOrigin(0.5);

    const home = this.add.rectangle(78, 96, 124, 44, 0x334155)
      .setStrokeStyle(2, 0x64748b)
      .setInteractive({ useHandCursor: true });

    const homeLabel = this.add.text(78, 96, "← HOME", {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "15px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    home.on("pointerover", () => home.setFillStyle(0x475569));
    home.on("pointerout", () => home.setFillStyle(0x334155));
    home.on("pointerdown", () => this.showMenu());
    homeLabel.setInteractive({ useHandCursor: true });
    homeLabel.on("pointerdown", () => this.showMenu());

    const bestKey = this.isDailyChallenge
      ? "grid-rivals-daily-best"
      : "grid-rivals-best-" + this.difficulty;

    const best = Number(localStorage.getItem(bestKey) || 0);

    this.bestText = this.add.text(this.startX + hudW - 16, hudY, `BEST: ${best}`, {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "15px",
      color: "#4ade80",
      fontStyle: "bold"
    }).setOrigin(1, 0.5);

    this.add.text(cx, 286, this.currentGameRun
      ? `REACH ${WIN_SCORE} TO WIN  •  CAPTURE ADJACENT CELLS`
      : "LOCAL PRACTICE · SCORE NOT SUBMITTED", {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "12px",
      color: "#94a3b8"
    }).setOrigin(0.5);

    const framePad = 8;
    this.add.rectangle(
      this.startX + this.gridSpan / 2,
      this.startY + this.gridSpan / 2,
      this.gridSpan + framePad * 2,
      this.gridSpan + framePad * 2,
      0x0f172a
    ).setStrokeStyle(2, 0x1e293b);

    this.createGrid();
    this.refreshBoard();
  }

  private newGameSeed(): number {
    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    return (randomValue[0] % 2_147_483_646) + 1;
  }

  private createGrid() {
    const state = this.rulesState;
    if (!state) return;

    for (let y = 0; y < state.board.length; y++) {
      this.grid[y] = [];

      for (let x = 0; x < state.board[y].length; x++) {
        const px = this.startX + x * (this.cell + this.gap);
        const py = this.startY + y * (this.cell + this.gap);

        const isStart = state.claimed[y][x];
        const value = state.board[y][x];

        const rect = this.add.rectangle(
          px + this.cell / 2,
          py + this.cell / 2,
          this.cell,
          this.cell,
          0x111827
        );

        const label = this.add.text(
          px + this.cell / 2,
          py + this.cell / 2,
          isStart ? "★" : String(value),
          {
            fontFamily: "Courier New, Courier, monospace",
            fontSize: isStart ? "28px" : "24px",
            color: "#ffffff",
            fontStyle: "bold"
          }
        ).setOrigin(0.5);

        const tile: Tile = {
          x, y, value,
          claimed: isStart,
          rect, label
        };

        rect.setInteractive({ useHandCursor: true });

        rect.on("pointerdown", () => this.claimTile(tile));

        this.grid[y][x] = tile;
      }
    }
  }

  private isAvailable(tile: Tile): boolean {
    return Boolean(this.rulesState && isValidMove(this.rulesState, { x: tile.x, y: tile.y }));
  }

  private claimTile(tile: Tile) {
    if (this.gameOver || !this.rulesState) return;
    const result = applyMove(this.rulesState, { x: tile.x, y: tile.y });
    if (!result.accepted) return;
    this.rulesState = result.state;

    // Claim the tile
    tile.claimed = true;
    this.playSound(520, 0.12, "sine");

    const pointsEarned = result.pointsEarned;
    this.score = this.rulesState.score;
    this.moves = this.rulesState.movesRemaining;

    // Capture animation
    tile.rect.setScale(0.8);
    tile.rect.setAlpha(0.5);

    this.tweens.add({
      targets: [tile.rect, tile.label],
      scale: 1.12,
      alpha: 1,
      duration: 180,
      ease: "Back.easeOut",
      yoyo: true,
      onComplete: () => {
        tile.rect.setScale(1);
        tile.label.setScale(1);
      }
    });

    // Score popup
    const pointsPopup = this.add.text(
      tile.rect.x,
      tile.rect.y - 10,
      `+${pointsEarned}`,
      {
        fontSize: "23px",
        color: "#4ade80",
        fontStyle: "bold",
        stroke: "#0b1220",
        strokeThickness: 5
      }
    ).setOrigin(0.5).setDepth(10);

    this.tweens.add({
      targets: pointsPopup,
      y: tile.rect.y - 65,
      alpha: 0,
      scale: 1.3,
      duration: 850,
      ease: "Cubic.easeOut",
      onComplete: () => pointsPopup.destroy()
    });

    // Update HUD
    this.scoreText.setText(`SCORE: ${this.score}`);
    this.movesText.setText(`MOVES: ${this.moves}`);

    this.presentUnlocks(recordTileClaim(this.profile, this.score));

    // Refresh tile colors
    this.refreshBoard();

    // Reaching the target wins; running out of moves ends the game.
    if (this.rulesState.status !== "playing") {
      this.finishGame();
    }
  }

  private refreshBoard() {
    for (const row of this.grid) {
      for (const tile of row) {
        const available = !tile.claimed && this.isAvailable(tile);

        if (tile.claimed) {
          // Captured territory: blue
          tile.rect.setFillStyle(0x1d4ed8);
          tile.rect.setStrokeStyle(2, 0x60a5fa);
          tile.label.setColor("#ffffff");

        } else if (available) {
          // Available territory: teal
          tile.rect.setFillStyle(0x164e63);
          tile.rect.setStrokeStyle(2, 0x22d3ee);
          tile.label.setColor("#67e8f9");

        } else {
          // Locked territory: dark grey
          tile.rect.setFillStyle(0x111827);
          tile.rect.setStrokeStyle(1, 0x273449);
          tile.label.setColor("#64748b");
        }
      }
    }
  }

  private finishGame() {
    this.gameOver = true;
    const won = this.rulesState?.status === "won";

    if (this.isDailyChallenge) {
      this.playSound(880, 0.25, "sine");
      this.playSound(1100, 0.3, "sine");
    } else if (won) {
      this.playAchievementSound();
    } else {
      this.playSound(220, 0.4, "triangle");
    }

    if (this.isDailyChallenge) {
      this.recordDailyCompletion();
    }

    // Separate all-time best scores for each game mode
    const key = this.isDailyChallenge
      ? "grid-rivals-daily-best"
      : "grid-rivals-best-" + this.difficulty;

    const oldBest = Number(localStorage.getItem(key) || 0);
    const best = Math.max(oldBest, this.score);

    localStorage.setItem(key, String(best));
    this.bestText.setText(`BEST: ${best}`);

    const reward = recordGameCompletion(
      this.profile,
      this.score,
      this.isDailyChallenge,
      Number(localStorage.getItem("grid-rivals-daily-total") || 0),
      Number(localStorage.getItem("grid-rivals-daily-streak") || 0),
      this.moves
    );
    this.presentUnlocks(reward.unlocks);

    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    const panelW = 500;
    const panelH = this.isDailyChallenge ? 428 : 376;
    const top = cy - panelH / 2;

    const dim = this.add.rectangle(cx, cy, this.viewW, this.viewH, 0x020617, 0.82)
      .setDepth(30)
      .setInteractive();

    dim.on("pointerdown", () => {
      /* Swallow clicks on the board underneath the modal. */
    });

    this.add.rectangle(cx, cy, panelW, panelH, 0x172033)
      .setStrokeStyle(3, 0x22d3ee)
      .setDepth(31);

    this.add.rectangle(cx, top + 4, panelW, 6, 0x22d3ee).setDepth(32);

    this.add.text(
      cx,
      top + 52,
      this.isDailyChallenge ? "DAILY CHALLENGE COMPLETE" : won ? "VICTORY" : "GAME OVER",
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: this.isDailyChallenge ? "18px" : "28px",
        color: "#ffffff",
        fontStyle: "bold"
      }
    ).setOrigin(0.5).setDepth(32);

    this.scoreSubmissionText = this.add.text(
      cx,
      this.isDailyChallenge ? top + 258 : top + 216,
      this.currentGameRun ? "VERIFYING MOVE TRANSCRIPT..." : "PRACTICE SCORE · NOT VERIFIED",
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: "10px",
        color: "#fbbf24",
        fontStyle: "bold"
      }
    ).setOrigin(0.5).setDepth(32);
    if (this.currentGameRun) void this.submitGameResult();

    this.finalScoreText = this.add.text(cx, top + 108, `FINAL SCORE: ${this.score}`, {
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "22px",
      color: "#4ade80",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(32);

    this.add.text(
      cx,
      top + 150,
      `${this.isDailyChallenge ? "TODAY'S BEST" : "PERSONAL BEST"}: ${best}`,
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: "15px",
        color: "#94a3b8"
      }
    ).setOrigin(0.5).setDepth(32);

    if (this.isDailyChallenge) {
      this.add.text(
        cx,
        top + 190,
        `DAILY STREAK: ${this.dailyStreak} DAYS`,
        {
          fontFamily: "Courier New, Courier, monospace",
          fontSize: "16px",
          color: "#fbbf24",
          fontStyle: "bold"
        }
      ).setOrigin(0.5).setDepth(32);
    }

    const progress = levelProgress(this.profile.xp);
    this.serverProgressText = this.add.text(
      cx,
      this.isDailyChallenge ? top + 228 : top + 188,
      this.currentGameRun ? "SERVER PROGRESSION PENDING" : `LOCAL +${reward.gameXp} XP  •  LEVEL ${progress.level}`,
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: "15px",
        color: "#fbbf24",
        fontStyle: "bold"
      }
    ).setOrigin(0.5).setDepth(32);

    const replayY = this.isDailyChallenge ? top + 286 : top + 246;
    const menuY = replayY + 68;
    const buttonW = 420;
    const buttonH = 52;

    const replay = this.add.rectangle(cx, replayY, buttonW, buttonH, 0x2563eb)
      .setStrokeStyle(2, 0x93c5fd)
      .setDepth(32)
      .setInteractive({ useHandCursor: true });

    const replayLabel = this.add.text(
      cx,
      replayY,
      this.isDailyChallenge ? "PLAY TODAY'S CHALLENGE AGAIN" : "PLAY AGAIN",
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: this.isDailyChallenge ? "14px" : "16px",
        color: "#ffffff",
        fontStyle: "bold"
      }
    ).setOrigin(0.5).setDepth(33).setInteractive({ useHandCursor: true });

    const playAgain = () => this.startGame();
    replay.on("pointerover", () => replay.setFillStyle(0x3b82f6));
    replay.on("pointerout", () => replay.setFillStyle(0x2563eb));
    replay.on("pointerdown", playAgain);
    replayLabel.on("pointerdown", playAgain);

    const menu = this.add.rectangle(cx, menuY, buttonW, buttonH, 0x1e293b)
      .setStrokeStyle(2, 0x60a5fa)
      .setDepth(32)
      .setInteractive({ useHandCursor: true });

    const menuLabel = this.add.text(
      cx,
      menuY,
      this.isDailyChallenge ? "BACK TO MAIN MENU" : "CHANGE DIFFICULTY",
      {
        fontFamily: "Courier New, Courier, monospace",
        fontSize: "16px",
        color: "#93c5fd",
        fontStyle: "bold"
      }
    ).setOrigin(0.5).setDepth(33).setInteractive({ useHandCursor: true });

    const backToMenu = () => this.showMenu();
    menu.on("pointerover", () => menu.setFillStyle(0x334155));
    menu.on("pointerout", () => menu.setFillStyle(0x1e293b));
    menu.on("pointerdown", backToMenu);
    menuLabel.on("pointerdown", backToMenu);
  }

  private drawLevelBar(x: number, y: number, width: number) {
    const progress = levelProgress(this.profile.xp);
    const font = "Courier New, Courier, monospace";

    this.add.text(x, y - 16, `LEVEL ${progress.level}`, {
      fontFamily: font,
      fontSize: "13px",
      color: "#fbbf24",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this.add.rectangle(x, y + 6, width, 12, 0x1e293b)
      .setStrokeStyle(1, 0x334155);

    const fill = progress.needed === 0
      ? width
      : Math.max(0, Math.min(width, (progress.current / progress.needed) * width));

    if (fill > 0) {
      this.add.rectangle(x - width / 2 + fill / 2, y + 6, fill, 8, 0x22d3ee);
    }

    this.add.text(x, y + 24, `${progress.current} / ${progress.needed} XP`, {
      fontFamily: font,
      fontSize: "11px",
      color: "#94a3b8"
    }).setOrigin(0.5);
  }

  private async submitGameResult() {
    const run = this.currentGameRun;
    const state = this.rulesState;
    const status = this.scoreSubmissionText;
    if (!run || !state || !status || this.submissionInFlight) return;

    this.submissionInFlight = true;
    this.submissionRetryAvailable = false;
    status.removeAllListeners("pointerdown");
    status.disableInteractive();
    status.setText("VERIFYING MOVE TRANSCRIPT...").setColor("#fbbf24");

    try {
      const result = await submitVerifiedGame(run.runId, state.moveHistory);
      if (!status.active || this.scoreSubmissionText !== status) return;

      this.score = result.score;
      this.finalScoreText?.setText(`FINAL SCORE: ${result.score}`);
      this.serverProgressText?.setText(`SERVER XP: ${result.totalXp}  •  LEVEL ${result.playerLevel}`);
      status
        .setText(result.duplicate ? "VERIFIED RESULT ALREADY SAVED" : "GAME VERIFIED AND SAVED")
        .setColor("#4ade80");
      void refreshLeaderboardData();
    } catch (error) {
      if (!status.active || this.scoreSubmissionText !== status) return;
      this.submissionRetryAvailable = true;
      status
        .setText("VERIFICATION FAILED · TAP TO RETRY")
        .setColor("#fbbf24")
        .setInteractive({ useHandCursor: true });
      status.on("pointerdown", () => void this.submitGameResult());
      if (error instanceof Error) console.warn("Verified game submission failed:", error.message);
    } finally {
      this.submissionInFlight = false;
    }
  }

  private showLeaderboard() {
    this.clearScreen();
    const container = document.getElementById("app");
    if (!container) {
      this.showMenu();
      return;
    }

    this.leaderboardView = new LeaderboardView(container, {
      playerLevel: this.profile.level,
      localBests: {
        easy: Number(localStorage.getItem("grid-rivals-best-Easy") || 0),
        medium: Number(localStorage.getItem("grid-rivals-best-Medium") || 0),
        hard: Number(localStorage.getItem("grid-rivals-best-Hard") || 0)
      },
      onClose: () => this.showMenu()
    });
  }

  private showAchievements() {
    this.clearScreen();

    const font = "Courier New, Courier, monospace";
    const progress = levelProgress(this.profile.xp);

    this.add.rectangle(280, 460, 520, 880, 0x0f172a)
      .setStrokeStyle(2, 0x1e293b);

    this.add.text(280, 42, "ACHIEVEMENTS", {
      fontFamily: font,
      fontSize: "26px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this.add.text(280, 72, `LEVEL ${progress.level}  •  ${this.profile.xp} XP`, {
      fontFamily: font,
      fontSize: "13px",
      color: "#fbbf24",
      fontStyle: "bold"
    }).setOrigin(0.5);

    const barWidth = 280;
    this.add.rectangle(280, 96, barWidth, 12, 0x1e293b).setStrokeStyle(1, 0x334155);
    const fill = Math.max(0, Math.min(barWidth, (progress.current / progress.needed) * barWidth));
    if (fill > 0) {
      this.add.rectangle(280 - barWidth / 2 + fill / 2, 96, fill, 8, 0x22d3ee);
    }
    this.add.text(280, 114, `${progress.current} / ${progress.needed} TO NEXT LEVEL`, {
      fontFamily: font,
      fontSize: "10px",
      color: "#94a3b8"
    }).setOrigin(0.5);

    const cardH = 84;
    const gap = 4;
    const listTop = 136;

    ACHIEVEMENTS.forEach((achievement, index) => {
      const y = listTop + index * (cardH + gap) + cardH / 2;
      const unlocked = Boolean(this.profile.unlocked[achievement.id]);
      const current = achievementProgress(this.profile, achievement.id);
      const ratio = achievement.goal === 0 ? 1 : current / achievement.goal;

      this.add.rectangle(280, y, 492, cardH, unlocked ? 0x132033 : 0x111827)
        .setStrokeStyle(2, unlocked ? 0x22d3ee : 0x334155);

      this.add.text(50, y - 26, achievement.name.toUpperCase(), {
        fontFamily: font,
        fontSize: "14px",
        color: unlocked ? "#ffffff" : "#cbd5e1",
        fontStyle: "bold"
      }).setOrigin(0, 0.5);

      this.add.text(510, y - 26, `+${achievement.xp} XP`, {
        fontFamily: font,
        fontSize: "12px",
        color: "#fbbf24",
        fontStyle: "bold"
      }).setOrigin(1, 0.5);

      this.add.text(50, y - 6, achievement.description, {
        fontFamily: font,
        fontSize: "11px",
        color: "#94a3b8"
      }).setOrigin(0, 0.5);

      const trackX = 250;
      const trackW = 110;
      this.add.rectangle(trackX, y + 20, trackW, 8, 0x1e293b);
      const progressWidth = Math.max(0, Math.min(trackW, ratio * trackW));
      if (progressWidth > 0) {
        this.add.rectangle(
          trackX - trackW / 2 + progressWidth / 2,
          y + 20,
          progressWidth,
          6,
          unlocked ? 0x4ade80 : 0x38bdf8
        );
      }

      this.add.text(314, y + 20, `${current}/${achievement.goal}`, {
        fontFamily: font,
        fontSize: "11px",
        color: "#e2e8f0"
      }).setOrigin(0, 0.5);

      const date = unlocked
        ? (this.profile.unlocked[achievement.id] || "").slice(0, 10)
        : "LOCKED";
      this.add.text(50, y + 20, date, {
        fontFamily: font,
        fontSize: "11px",
        color: unlocked ? "#67e8f9" : "#64748b",
        fontStyle: "bold"
      }).setOrigin(0, 0.5);

      this.add.text(510, y + 20, unlocked ? "UNLOCKED" : "", {
        fontFamily: font,
        fontSize: "11px",
        color: "#4ade80",
        fontStyle: "bold"
      }).setOrigin(1, 0.5);
    });

    const back = this.add.text(280, 878, "BACK TO MENU", {
      fontFamily: font,
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#2563eb",
      padding: { x: 18, y: 10 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    back.on("pointerdown", () => this.showMenu());
    back.on("pointerover", () => back.setBackgroundColor("#3b82f6"));
    back.on("pointerout", () => back.setBackgroundColor("#2563eb"));
  }

  private presentUnlocks(ids: AchievementId[]) {
    for (const id of ids) {
      if (!this.toastQueue.includes(id)) this.toastQueue.push(id);
    }
    this.showNextToast();
  }

  private showNextToast() {
    if (this.toastActive || this.toastQueue.length === 0) return;

    const id = this.toastQueue.shift();
    if (!id) return;

    const achievement = achievementById(id);
    const generation = this.toastGeneration;
    this.toastActive = true;

    const font = "Courier New, Courier, monospace";
    const card = this.add.rectangle(280, 118, 460, 86, 0x172033)
      .setStrokeStyle(3, 0xfbbf24)
      .setDepth(60)
      .setScale(0.86)
      .setAlpha(0);
    const title = this.add.text(280, 100, "ACHIEVEMENT UNLOCKED", {
      fontFamily: font,
      fontSize: "12px",
      color: "#fbbf24",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(61).setAlpha(0);
    const name = this.add.text(280, 124, achievement.name.toUpperCase(), {
      fontFamily: font,
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(61).setAlpha(0);
    const reward = this.add.text(280, 146, `+${achievement.xp} XP`, {
      fontFamily: font,
      fontSize: "14px",
      color: "#4ade80",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(61).setAlpha(0);

    const objects = [card, title, name, reward];
    this.playAchievementSound();

    this.tweens.add({
      targets: objects,
      alpha: 1,
      scale: 1,
      duration: 280,
      ease: "Back.easeOut",
      onComplete: () => {
        this.time.delayedCall(1600, () => {
          if (generation !== this.toastGeneration) return;
          this.tweens.add({
            targets: objects,
            alpha: 0,
            y: "-=24",
            duration: 280,
            ease: "Cubic.easeIn",
            onComplete: () => {
              objects.forEach((object) => object.destroy());
              if (generation !== this.toastGeneration) return;
              this.toastActive = false;
              this.showNextToast();
            }
          });
        });
      }
    });
  }

  private playAchievementSound() {
    this.playSound(523, 0.1, "square");
    this.time.delayedCall(90, () => this.playSound(659, 0.1, "square"));
    this.time.delayedCall(180, () => this.playSound(784, 0.16, "square"));
  }

  private playSound(frequency: number, duration: number, type: OscillatorType = "sine") {

    if (!this.soundEnabled)
      return;

    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;

      const audioContext = new AudioContextClass();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(
        frequency,
        audioContext.currentTime
      );

      gain.gain.setValueAtTime(0.12, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);

      oscillator.onended = () => audioContext.close();
    } catch (error) {
      console.warn("Sound could not be played:", error);
    }
  }

}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 560,
  height: 920,
  parent: "app",
  backgroundColor: "#0b1220",
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.NO_CENTER
  }
});
