import {
  createDailyGameConfig,
  createStandardGameConfig,
  dailySeedForDate,
  maxFinalScore,
  maxMovesForDifficulty,
  replayMoveTranscript,
  type Difficulty,
  type GameStatus,
  type Position
} from "./grid-rivals-rules.ts";

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_RULES_VERSION = 1;
const SUPPORTED_RNG_VERSION = 1;

export type SubmitGameRequest = {
  runId: string;
  moves: Position[];
};

export type StoredGameRun = {
  run_id: string;
  user_id: string;
  game_mode: "easy" | "medium" | "hard" | "daily";
  difficulty: "easy" | "medium" | "hard";
  seed: number | string;
  rules_version: number;
  rng_version: number;
  daily_date: string | null;
  started_at: string;
  expires_at: string;
  consumed_at: string | null;
  final_result: unknown;
  score_id: string | null;
};

export type VerifiedGameResult = {
  runId: string;
  gameMode: StoredGameRun["game_mode"];
  difficulty: StoredGameRun["difficulty"];
  score: number;
  status: Exclude<GameStatus, "playing">;
  movesPlayed: number;
  movesRemaining: number;
  tilesClaimed: number;
};

export type VerificationErrorCode =
  | "invalid-request"
  | "invalid-run-id"
  | "run-not-found"
  | "wrong-owner"
  | "consumed-run"
  | "expired-run"
  | "invalid-run-config"
  | "unsupported-version"
  | "invalid-transcript"
  | "illegal-move"
  | "incomplete-game"
  | "invalid-result";

export class VerificationError extends Error {
  readonly code: VerificationErrorCode;

  constructor(code: VerificationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function parseSubmitGameRequest(value: unknown): SubmitGameRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VerificationError("invalid-request", "Request body must be a JSON object.");
  }

  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "runId" && key !== "moves")) {
    throw new VerificationError("invalid-request", "Only runId and moves may be provided.");
  }
  if (typeof body.runId !== "string" || !RUN_ID_PATTERN.test(body.runId)) {
    throw new VerificationError("invalid-run-id", "runId must be a valid UUID.");
  }
  if (!Array.isArray(body.moves)) {
    throw new VerificationError("invalid-transcript", "moves must be an array.");
  }
  if (body.moves.length > maxMovesForDifficulty("Easy")) {
    throw new VerificationError("invalid-transcript", "Transcript cannot contain more than 18 moves.");
  }

  const moves = body.moves.map((move): Position => {
    if (!move || typeof move !== "object" || Array.isArray(move)) {
      throw new VerificationError("invalid-transcript", "Each move must contain integer x and y coordinates.");
    }
    const coordinates = move as Record<string, unknown>;
    if (
      Object.keys(coordinates).length !== 2 ||
      !Object.hasOwn(coordinates, "x") ||
      !Object.hasOwn(coordinates, "y") ||
      !Number.isInteger(coordinates.x) ||
      !Number.isInteger(coordinates.y)
    ) {
      throw new VerificationError("invalid-transcript", "Each move must contain only integer x and y coordinates.");
    }
    return { x: coordinates.x as number, y: coordinates.y as number };
  });

  return { runId: body.runId, moves };
}

function difficultyName(difficulty: StoredGameRun["difficulty"]): Difficulty {
  switch (difficulty) {
    case "easy": return "Easy";
    case "medium": return "Medium";
    case "hard": return "Hard";
  }
}

type ReplayOptions = {
  allowExpiredRun?: boolean;
  allowHistoricalDailyRun?: boolean;
};

function validateRunConfiguration(run: StoredGameRun, now: Date, options: ReplayOptions) {
  if (run.rules_version !== SUPPORTED_RULES_VERSION || run.rng_version !== SUPPORTED_RNG_VERSION) {
    throw new VerificationError("unsupported-version", "This game run uses unsupported rules or RNG versions.");
  }

  const seed = Number(run.seed);
  if (!Number.isSafeInteger(seed)) {
    throw new VerificationError("invalid-run-config", "The stored run seed is invalid.");
  }

  const difficulty = difficultyName(run.difficulty);
  if (run.game_mode === "daily") {
    if (
      !run.daily_date ||
      (!options.allowHistoricalDailyRun && run.daily_date !== now.toISOString().slice(0, 10)) ||
      difficulty !== "Medium"
    ) {
      throw new VerificationError("invalid-run-config", "Daily run date or difficulty is invalid.");
    }
    if (seed !== dailySeedForDate(run.daily_date)) {
      throw new VerificationError("invalid-run-config", "Daily run seed does not match its stored UTC date.");
    }
    return createDailyGameConfig(run.daily_date);
  }

  if (run.daily_date !== null || run.game_mode !== run.difficulty) {
    throw new VerificationError("invalid-run-config", "Standard run mode, difficulty, or daily date is invalid.");
  }

  try {
    return createStandardGameConfig(difficulty, seed);
  } catch {
    throw new VerificationError("invalid-run-config", "The stored run configuration is invalid.");
  }
}

export function verifyGameTranscript(
  run: StoredGameRun,
  authenticatedUserId: string,
  moves: readonly Position[],
  now = new Date(),
  options: ReplayOptions = {}
): VerifiedGameResult {
  if (run.user_id !== authenticatedUserId) {
    throw new VerificationError("wrong-owner", "Game run does not belong to the authenticated user.");
  }
  if (run.consumed_at !== null) {
    throw new VerificationError("consumed-run", "Game run has already been consumed.");
  }

  const startedAt = Date.parse(run.started_at);
  const expiresAt = Date.parse(run.expires_at);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(expiresAt) ||
    startedAt > now.getTime() ||
    (!options.allowExpiredRun && expiresAt <= now.getTime()) ||
    expiresAt <= startedAt
  ) {
    throw new VerificationError("expired-run", "Game run is expired or has invalid timestamps.");
  }

  const config = validateRunConfiguration(run, now, options);
  const maxMoves = maxMovesForDifficulty(config.difficulty);
  if (moves.length < 1 || moves.length > maxMoves) {
    throw new VerificationError("invalid-transcript", "Move count is outside this game's limit.");
  }

  const replay = replayMoveTranscript(config, moves);
  if (!replay.valid || replay.error === "invalid-move" || replay.error === "moves-after-completion") {
    throw new VerificationError("illegal-move", "Transcript contains an illegal move.");
  }
  if (!replay.complete || replay.state.status === "playing") {
    throw new VerificationError("incomplete-game", "Transcript does not reach a terminal game state.");
  }

  const score = replay.state.score;
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score % 10 !== 0 ||
    score > maxFinalScore(config.difficulty)
  ) {
    throw new VerificationError("invalid-result", "Replayed result is outside the canonical game rules.");
  }

  return {
    runId: run.run_id,
    gameMode: run.game_mode,
    difficulty: run.difficulty,
    score,
    status: replay.state.status,
    movesPlayed: replay.state.moveHistory.length,
    movesRemaining: replay.state.movesRemaining,
    tilesClaimed: replay.state.moveHistory.length
  };
}

export function verifyConsumedRunRetry(
  run: StoredGameRun,
  authenticatedUserId: string,
  moves: readonly Position[],
  now = new Date()
): VerifiedGameResult {
  if (run.consumed_at === null || run.score_id === null) {
    throw new VerificationError("consumed-run", "Game run has not been finalized.");
  }

  const replayRun = { ...run, consumed_at: null };
  const result = verifyGameTranscript(replayRun, authenticatedUserId, moves, now, {
    allowExpiredRun: true,
    allowHistoricalDailyRun: true
  });
  const stored = run.final_result;
  if (
    !stored || typeof stored !== "object" || Array.isArray(stored) ||
    !matchesFinalizedRunResult(run, result)
  ) {
    throw new VerificationError("consumed-run", "Transcript does not match the finalized game result.");
  }
  return result;
}

export function matchesFinalizedRunResult(run: StoredGameRun, result: VerifiedGameResult): boolean {
  if (!run.final_result || typeof run.final_result !== "object" || Array.isArray(run.final_result)) {
    return false;
  }
  const stored = run.final_result as Record<string, unknown>;
  return run.score_id !== null &&
    stored.score === result.score &&
    stored.status === result.status &&
    stored.moves_played === result.movesPlayed &&
    stored.moves_remaining === result.movesRemaining &&
    stored.tiles_claimed === result.tilesClaimed &&
    stored.rules_version === run.rules_version &&
    stored.rng_version === run.rng_version;
}
