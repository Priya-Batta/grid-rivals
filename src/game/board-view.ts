import Phaser from "phaser";
import type { GameState } from "../../shared/grid-rivals-rules.ts";

export type BoardTile = {
  x: number;
  y: number;
  value: number;
  claimed: boolean;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

export type BoardLayout = {
  startX: number;
  startY: number;
  cell: number;
  gap: number;
};

export function createBoardView(
  scene: Phaser.Scene,
  state: GameState,
  layout: BoardLayout,
  onTileSelect: (tile: BoardTile) => void
): BoardTile[][] {
  const grid: BoardTile[][] = [];

  for (let y = 0; y < state.board.length; y++) {
    grid[y] = [];

    for (let x = 0; x < state.board[y].length; x++) {
      const px = layout.startX + x * (layout.cell + layout.gap);
      const py = layout.startY + y * (layout.cell + layout.gap);
      const isStart = state.claimed[y][x];
      const value = state.board[y][x];

      const rect = scene.add.rectangle(
        px + layout.cell / 2,
        py + layout.cell / 2,
        layout.cell,
        layout.cell,
        0xeaf0ff
      );

      const label = scene.add.text(
        px + layout.cell / 2,
        py + layout.cell / 2,
        isStart ? "★" : String(value),
        {
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: isStart ? "30px" : "28px",
          color: "#1e293b",
          fontStyle: "bold",
        }
      ).setOrigin(0.5)
        .setResolution(4);

      const tile: BoardTile = {
        x, y, value,
        claimed: isStart,
        rect, label
      };

      rect.setInteractive({ useHandCursor: true });
      rect.on("pointerdown", () => onTileSelect(tile));
      grid[y][x] = tile;
    }
  }

  return grid;
}

export function refreshBoardView(
  grid: BoardTile[][],
  isAvailable: (tile: BoardTile) => boolean
): void {
  for (const row of grid) {
    for (const tile of row) {
      const available = !tile.claimed && isAvailable(tile);

      if (tile.claimed) {
        tile.rect.setFillStyle(0x4f46e5);
        tile.rect.setStrokeStyle(2, 0x818cf8);
        tile.label.setColor("#1e293b");
      } else if (available) {
        tile.rect.setFillStyle(0xd1fae5);
        tile.rect.setStrokeStyle(2, 0x0ea5e9);
        tile.label.setColor("#047857");
      } else {
        tile.rect.setFillStyle(0xeaf0ff);
        tile.rect.setStrokeStyle(1, 0xcbd5e1);
        tile.label.setColor("#64748b");
      }
    }
  }
}
