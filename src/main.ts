
import Phaser from "phaser";
import "./style.css";

type Difficulty = "Easy" | "Medium" | "Hard";

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
  private score = 0;
  private moves = 12;
  private difficulty: Difficulty = "Medium";
  private gameOver = false;
  private isDailyChallenge = false;
  private dailyStreak = 0;
  private soundEnabled = localStorage.getItem("grid-rivals-sound") !== "off";

  private scoreText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;

  private readonly size = 8;
  private readonly cell = 54;
  private readonly gap = 7;
  private readonly startX = 39;
  private readonly startY = 190;

  constructor() {
    super("GameScene");
  }

  create() {
    this.showMenu();
  }

  private clearScreen() {
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

    this.add.rectangle(280, 180, 150, 4, 0x22d3ee);

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

    this.add.text(280, 245, "CHOOSE YOUR GAME", {
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
        this.startGame();
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
      280, 680, 250, 54, 0x5b21b6
    )
      .setStrokeStyle(2, 0xa78bfa)
      .setInteractive({ useHandCursor: true });

    this.add.text(280, 680, "PLAYER STATISTICS", {
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

    // Sound ON/OFF button
    const soundButton = this.add.text(
      280,
      750,
      this.soundEnabled ? "SOUND: ON" : "SOUND: OFF",
      {
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#334155",
        padding: { x: 18, y: 10 }
      }
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

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
    this.add.text(280, 790, "CAPTURE  •  EXPAND  •  CONQUER", {
      fontSize: "12px",
      color: "#64748b",
      letterSpacing: 2
    }).setOrigin(0.5);
  }

  private startGame() {
    this.clearScreen();

    this.moves = {
      Easy: 18,
      Medium: 12,
      Hard: 8
    }[this.difficulty];

    this.add.text(280, 35, "GRID RIVALS", {
      fontSize: "32px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this.add.text(
      280,
      75,
      this.isDailyChallenge ? "DAILY CHALLENGE" : this.difficulty.toUpperCase() + " MODE",
      {
        fontSize: "13px",
        color: "#4ade80",
        letterSpacing: 2
      }
    ).setOrigin(0.5);

    this.scoreText = this.add.text(35, 115, "SCORE: 0", {
      fontSize: "17px",
      color: "#60a5fa",
      fontStyle: "bold"
    });

    this.movesText = this.add.text(280, 115, `MOVES: ${this.moves}`, {
      fontSize: "17px",
      color: "#fbbf24",
      fontStyle: "bold"
    }).setOrigin(0.5, 0);

    const homeButton = this.add.text(45, 35, "← HOME", {
      fontSize: "15px",
      color: "#ffffff",
      backgroundColor: "#334155",
      padding: { x: 12, y: 9 }
    })
      .setInteractive({ useHandCursor: true });

    homeButton.on("pointerdown", () => {
      this.showMenu();
    });

    const best = Number(
      localStorage.getItem("grid-rivals-best-" + this.difficulty) || 0
    );

    this.bestText = this.add.text(525, 115, `BEST: ${best}`, {
      fontSize: "14px",
      color: "#4ade80",
      fontStyle: "bold"
    }).setOrigin(1, 0);

    this.add.text(280, 150, "Capture adjacent cells to expand your territory", {
      fontSize: "11px",
      color: "#94a3b8"
    }).setOrigin(0.5);

    this.createGrid();
    this.refreshBoard();
  }

  private dailyRandom(seed: number): () => number {
    let value = seed;

    return () => {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  private createGrid() {
    const center = Math.floor(this.size / 2);

    // Use UTC date so everyone gets the same daily board
    const today = new Date();

    const dateSeed = Number(
      `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`
    );

    // Daily challenge uses seeded randomness.
    // Normal modes continue using random values.
    const random = this.isDailyChallenge
      ? this.dailyRandom(dateSeed)
      : Math.random;

    for (let y = 0; y < this.size; y++) {
      this.grid[y] = [];

      for (let x = 0; x < this.size; x++) {
        const px = this.startX + x * (this.cell + this.gap);
        const py = this.startY + y * (this.cell + this.gap);

        const isStart = x === center && y === center;

        const maxValue = this.difficulty === "Hard" ? 5 : 3;

        const value = isStart
          ? 0
          : Math.floor(random() * maxValue) + 1;

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
            fontSize: isStart ? "23px" : "20px",
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
    const directions = [
      [0, -1], [0, 1], [-1, 0], [1, 0]
    ];

    return directions.some(([dx, dy]) => {
      const nx = tile.x + dx;
      const ny = tile.y + dy;

      return (
        nx >= 0 && nx < this.size &&
        ny >= 0 && ny < this.size &&
        this.grid[ny][nx].claimed
      );
    });
  }

  private claimTile(tile: Tile) {
    if (this.gameOver || tile.claimed || this.moves <= 0) return;
    if (!this.isAvailable(tile)) return;

    // Claim the tile
    tile.claimed = true;
    this.playSound(520, 0.12, "sine");

    const pointsEarned = tile.value * 10;
    this.score += pointsEarned;
    this.moves--;

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

    // Refresh tile colors
    this.refreshBoard();

    // End game when moves run out
    if (this.moves === 0) {
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
    if (this.isDailyChallenge) {
      this.playSound(880, 0.25, "sine");
      this.playSound(1100, 0.3, "sine");
    } else {
      this.playSound(220, 0.4, "triangle");
    }

    if (this.isDailyChallenge) {
      this.recordDailyCompletion();
    }

    // Get today's local date
    const today = new Date();
    const dateKey =
      today.getFullYear() + "-" +
      String(today.getMonth() + 1).padStart(2, "0") + "-" +
      String(today.getDate()).padStart(2, "0");

    // Use a separate best-score record for Daily Challenge
    const key = this.isDailyChallenge
      ? "grid-rivals-daily-best-" + dateKey
      : "grid-rivals-best-" + this.difficulty;

    const oldBest = Number(localStorage.getItem(key) || 0);
    const best = Math.max(oldBest, this.score);

    localStorage.setItem(key, String(best));
    this.bestText.setText(`BEST: ${best}`);

    // Completion screen
    this.add.rectangle(280, 650, 370, 260, 0x172033)
      .setStrokeStyle(2, 0x60a5fa);

    this.add.text(
      280,
      565,
      this.isDailyChallenge ? "DAILY CHALLENGE COMPLETE" : "GAME OVER",
      {
        fontSize: this.isDailyChallenge ? "20px" : "26px",
        color: "#ffffff",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.add.text(280, 610, `FINAL SCORE: ${this.score}`, {
      fontSize: "20px",
      color: "#4ade80"
    }).setOrigin(0.5);

    this.add.text(
      280,
      645,
      `${this.isDailyChallenge ? "TODAY'S BEST" : "PERSONAL BEST"}: ${best}`,
      {
        fontSize: "14px",
        color: "#94a3b8"
      }
    ).setOrigin(0.5);

    if (this.isDailyChallenge) {
      this.add.text(
        280,
        675,
        `DAILY STREAK: ${this.dailyStreak} DAYS`,
        {
          fontSize: "14px",
          color: "#fbbf24",
          fontStyle: "bold"
        }
      ).setOrigin(0.5);
    }

    const replay = this.add.text(
      280,
      700,
      this.isDailyChallenge ? "PLAY TODAY'S CHALLENGE AGAIN" : "PLAY AGAIN",
      {
        fontSize: this.isDailyChallenge ? "13px" : "17px",
        color: "#ffffff",
        backgroundColor: "#2563eb",
        padding: { x: 20, y: 12 }
      }
    ).setOrigin(0.5).setInteractive({ useHandCursor: true });

    replay.on("pointerdown", () => this.startGame());

    const menu = this.add.text(
      280,
      770,
      this.isDailyChallenge ? "BACK TO MAIN MENU" : "CHANGE DIFFICULTY",
      {
        fontSize: "16px",
        color: "#60a5fa",
        backgroundColor: "#1e293b",
        padding: { x: 20, y: 12 }
      }
    ).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menu.on("pointerdown", () => this.showMenu());
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
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
