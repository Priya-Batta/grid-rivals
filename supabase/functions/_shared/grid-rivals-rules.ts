export const RULES_VERSION = 1 as const;
export const RNG_VERSION = 1 as const;
export const GRID_SIZE = 8;
export const WIN_SCORE = 200;

const RNG_MODULUS = 2_147_483_647;
const RNG_MULTIPLIER = 16_807;

export type Difficulty = "Easy" | "Medium" | "Hard";
export type GameMode = "standard" | "daily";
export type GameStatus = "playing" | "won" | "lost";

export type StandardGameConfig = {
  rulesVersion: typeof RULES_VERSION;
  rngVersion: typeof RNG_VERSION;
  mode: "standard";
  difficulty: Difficulty;
  seed: number;
};

export type DailyGameConfig = {
  rulesVersion: typeof RULES_VERSION;
  rngVersion: typeof RNG_VERSION;
  mode: "daily";
  difficulty: "Medium";
  dailyDate: string;
  seed: number;
};

export type GameConfig = StandardGameConfig | DailyGameConfig;
export type Position = { x: number; y: number };
export type GameBoard = readonly (readonly number[])[];
export type ClaimedBoard = readonly (readonly boolean[])[];

export type GameState = {
  config: GameConfig;
  board: GameBoard;
  claimed: ClaimedBoard;
  score: number;
  movesRemaining: number;
  status: GameStatus;
  moveHistory: readonly Position[];
};

export type AppliedMove = {
  accepted: boolean;
  pointsEarned: number;
  state: GameState;
};

export type TranscriptReplay = {
  valid: boolean;
  complete: boolean;
  state: GameState;
  failedMoveIndex?: number;
  error?: "invalid-move" | "moves-after-completion" | "incomplete";
};

const DIFFICULTY_RULES: Record<Difficulty, { moves: number; maxTileValue: number }> = {
  Easy: { moves: 18, maxTileValue: 3 },
  Medium: { moves: 12, maxTileValue: 3 },
  Hard: { moves: 8, maxTileValue: 5 }
};

export function dailySeedForDate(utcDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDate)) {
    throw new RangeError("Daily date must use YYYY-MM-DD format");
  }

  const parsed = new Date(`${utcDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== utcDate) {
    throw new RangeError("Daily date is invalid");
  }

  return Number(utcDate.replaceAll("-", ""));
}

export function createStandardGameConfig(
  difficulty: Difficulty,
  seed: number
): StandardGameConfig {
  const config: StandardGameConfig = {
    rulesVersion: RULES_VERSION,
    rngVersion: RNG_VERSION,
    mode: "standard",
    difficulty,
    seed
  };
  assertValidConfig(config);
  return config;
}

export function createDailyGameConfig(utcDate: string): DailyGameConfig {
  const config: DailyGameConfig = {
    rulesVersion: RULES_VERSION,
    rngVersion: RNG_VERSION,
    mode: "daily",
    difficulty: "Medium",
    dailyDate: utcDate,
    seed: dailySeedForDate(utcDate)
  };
  assertValidConfig(config);
  return config;
}

function assertValidConfig(config: GameConfig) {
  if (config.rulesVersion !== RULES_VERSION || config.rngVersion !== RNG_VERSION) {
    throw new RangeError("Unsupported game rules or RNG version");
  }
  if (!Number.isSafeInteger(config.seed) || config.seed < 1 || config.seed >= RNG_MODULUS) {
    throw new RangeError("Seed must be an integer between 1 and 2147483646");
  }
  if (config.mode === "daily") {
    if (config.difficulty !== "Medium" || config.seed !== dailySeedForDate(config.dailyDate)) {
      throw new RangeError("Daily games must use the Medium rules and UTC date seed");
    }
  } else if (!(config.difficulty in DIFFICULTY_RULES)) {
    throw new RangeError("Unsupported game difficulty");
  }
}

function nextRandom(seed: number): { value: number; nextSeed: number } {
  const nextSeed = (seed * RNG_MULTIPLIER) % RNG_MODULUS;
  return {
    value: (nextSeed - 1) / (RNG_MODULUS - 1),
    nextSeed
  };
}

export function generateBoard(config: GameConfig): number[][] {
  assertValidConfig(config);
  const { maxTileValue } = DIFFICULTY_RULES[config.difficulty];
  const start = Math.floor(GRID_SIZE / 2);
  let seed = config.seed;
  const board: number[][] = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (x === start && y === start) {
        row.push(0);
        continue;
      }

      const next = nextRandom(seed);
      seed = next.nextSeed;
      row.push(Math.floor(next.value * maxTileValue) + 1);
    }
    board.push(row);
  }

  return board;
}

export function createGameState(config: GameConfig): GameState {
  const board = generateBoard(config);
  const start = Math.floor(GRID_SIZE / 2);
  const claimed = Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => x === start && y === start)
  );

  return {
    config,
    board,
    claimed,
    score: 0,
    movesRemaining: DIFFICULTY_RULES[config.difficulty].moves,
    status: "playing",
    moveHistory: []
  };
}

export function isValidMove(state: GameState, position: Position): boolean {
  if (!position || state.status !== "playing" || state.movesRemaining <= 0) return false;
  const { x, y } = position;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return false;
  if (state.claimed[y][x]) return false;

  return (
    (y > 0 && state.claimed[y - 1][x]) ||
    (y < GRID_SIZE - 1 && state.claimed[y + 1][x]) ||
    (x > 0 && state.claimed[y][x - 1]) ||
    (x < GRID_SIZE - 1 && state.claimed[y][x + 1])
  );
}

export function calculateTileScore(tileValue: number): number {
  if (!Number.isInteger(tileValue) || tileValue < 0) {
    throw new RangeError("Tile value must be a non-negative integer");
  }
  return tileValue * 10;
}

export function maxFinalScore(difficulty: Difficulty): number {
  const { maxTileValue } = DIFFICULTY_RULES[difficulty];
  return WIN_SCORE - 10 + calculateTileScore(maxTileValue);
}

export function maxMovesForDifficulty(difficulty: Difficulty): number {
  return DIFFICULTY_RULES[difficulty].moves;
}

export function determineGameCompletion(score: number, movesRemaining: number): GameStatus {
  if (score >= WIN_SCORE) return "won";
  if (movesRemaining <= 0) return "lost";
  return "playing";
}

export function applyMove(state: GameState, position: Position): AppliedMove {
  if (!isValidMove(state, position)) {
    return { accepted: false, pointsEarned: 0, state };
  }

  const pointsEarned = calculateTileScore(state.board[position.y][position.x]);
  const claimed = state.claimed.map((row) => [...row]);
  claimed[position.y][position.x] = true;
  const score = state.score + pointsEarned;
  const movesRemaining = state.movesRemaining - 1;

  const nextState: GameState = {
    ...state,
    claimed,
    score,
    movesRemaining,
    status: determineGameCompletion(score, movesRemaining),
    moveHistory: [...state.moveHistory, { x: position.x, y: position.y }]
  };

  return { accepted: true, pointsEarned, state: nextState };
}

export function replayMoveTranscript(
  config: GameConfig,
  moves: readonly Position[]
): TranscriptReplay {
  let state = createGameState(config);

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    if (state.status !== "playing") {
      return {
        valid: false,
        complete: true,
        state,
        failedMoveIndex: index,
        error: "moves-after-completion"
      };
    }

    const result = applyMove(state, move);
    if (!result.accepted) {
      return {
        valid: false,
        complete: false,
        state,
        failedMoveIndex: index,
        error: "invalid-move"
      };
    }
    state = result.state;
  }

  const complete = state.status !== "playing";
  return {
    valid: true,
    complete,
    state,
    ...(complete ? {} : { error: "incomplete" as const })
  };
}
