import {
  applyMove,
  createDailyGameConfig,
  createGameState,
  createStandardGameConfig,
  isValidMove,
  type GameConfig,
  type Position
} from "./grid-rivals-rules.ts";
import {
  parseSubmitGameRequest,
  VerificationError,
  verifyConsumedRunRetry,
  verifyGameTranscript,
  type StoredGameRun
} from "./submit-game-verifier.ts";

const now = new Date("2026-11-05T12:00:00.000Z");
const userId = "123e4567-e89b-42d3-a456-426614174000";
const runId = "00000000-0000-4000-8000-000000000001";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function expectCode(action: () => unknown, code: VerificationError["code"], message: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof VerificationError, `${message}: expected VerificationError`);
    assert(error.code === code, `${message}: expected ${code}, got ${error.code}`);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

function makeRun(
  config: GameConfig,
  options: Partial<StoredGameRun> = {}
): StoredGameRun {
  const difficulty = config.difficulty.toLowerCase() as StoredGameRun["difficulty"];
  return {
    run_id: runId,
    user_id: userId,
    game_mode: config.mode === "daily" ? "daily" : difficulty,
    difficulty,
    seed: config.seed,
    rules_version: config.rulesVersion,
    rng_version: config.rngVersion,
    daily_date: config.mode === "daily" ? config.dailyDate : null,
    started_at: new Date(now.getTime() - 60_000).toISOString(),
    expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
    consumed_at: null,
    final_result: null,
    score_id: null,
    ...options
  };
}

function greedyTranscript(config: GameConfig, highestFirst = false): Position[] {
  let state = createGameState(config);
  const moves: Position[] = [];
  while (state.status === "playing") {
    const candidates: Array<Position & { tileValue: number }> = [];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if (isValidMove(state, { x, y })) candidates.push({ x, y, tileValue: state.board[y][x] });
      }
    }
    candidates.sort((a, b) =>
      (highestFirst ? b.tileValue - a.tileValue : a.tileValue - b.tileValue) ||
      a.y - b.y || a.x - b.x
    );
    const next = candidates[0];
    assert(Boolean(next), "a legal move exists until all moves are used");
    const position = { x: next.x, y: next.y };
    moves.push(position);
    state = applyMove(state, position).state;
  }
  return moves;
}

const hardWinMoves: Position[] = greedyTranscript(createStandardGameConfig("Hard", 1), true);

const easyLossMoves: Position[] = [
  { x: 4, y: 3 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 },
  { x: 2, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 2 },
  { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 5, y: 2 }, { x: 5, y: 1 },
  { x: 6, y: 1 }, { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 2, y: 3 },
  { x: 5, y: 3 }, { x: 2, y: 4 }
];

function testValidWinAndLoss() {
  const hard = createStandardGameConfig("Hard", 1);
  const win = verifyGameTranscript(makeRun(hard), userId, hardWinMoves, now);
  assert(win.score >= 200, "win score reaches the target after using all moves");
  assert(win.status === "won" && win.movesRemaining === 0, "win is recorded only after all moves are used");
  assert(win.movesPlayed === 8 && win.tilesClaimed === 8, "win move and tile counts are derived");

  const easy = createStandardGameConfig("Easy", 3);
  const loss = verifyGameTranscript(makeRun(easy), userId, easyLossMoves, now);
  assert(loss.score === 180, "loss score is replayed from tiles");
  assert(loss.status === "lost" && loss.movesRemaining === 0, "loss requires exhausting moves below target");
  assert(loss.movesPlayed === 18, "loss move count is derived");
}

function testIllegalAndIncompleteTranscripts() {
  const config = createStandardGameConfig("Easy", 3);
  const run = makeRun(config);
  expectCode(() => verifyGameTranscript(run, userId, [{ x: 0, y: 0 }], now), "illegal-move", "non-adjacent move");
  expectCode(() => verifyGameTranscript(run, userId, easyLossMoves.slice(0, -1), now), "incomplete-game", "incomplete game");
  expectCode(() => verifyGameTranscript(run, userId, [...hardWinMoves, { x: 0, y: 0 }], now), "illegal-move", "moves after game completion");
}

function testRequestValidationRejectsClientResults() {
  const parsed = parseSubmitGameRequest({ runId, moves: [{ x: 1, y: 2 }] });
  assert(parsed.runId === runId && parsed.moves.length === 1, "minimal transcript is parsed");
  expectCode(
    () => parseSubmitGameRequest({ runId, moves: Array.from({ length: 19 }, () => ({ x: 1, y: 2 })) }),
    "invalid-transcript",
    "transcript with 19 moves is rejected during request parsing"
  );
  expectCode(() => parseSubmitGameRequest({ runId, moves: [], score: 9999 }), "invalid-request", "client score is rejected");
  expectCode(() => parseSubmitGameRequest({ runId, moves: [], user_id: userId }), "invalid-request", "client user ID is rejected");
  expectCode(() => parseSubmitGameRequest({ runId, moves: [{ x: 1, y: 2, value: 5 }] }), "invalid-transcript", "client tile value is rejected");
  expectCode(() => parseSubmitGameRequest({ runId, moves: [{ x: "1", y: 2 }] }), "invalid-transcript", "non-integer coordinate is rejected");
}

function testRunOwnershipAndLifecycle() {
  const config = createStandardGameConfig("Hard", 1);
  const run = makeRun(config);
  expectCode(() => verifyGameTranscript(run, "another-user", hardWinMoves, now), "wrong-owner", "wrong run owner");
  expectCode(() => verifyGameTranscript({ ...run, consumed_at: now.toISOString() }, userId, hardWinMoves, now), "consumed-run", "consumed run");
  expectCode(() => verifyGameTranscript({ ...run, expires_at: now.toISOString() }, userId, hardWinMoves, now), "expired-run", "expired run");
  expectCode(() => verifyGameTranscript({ ...run, started_at: new Date(now.getTime() + 1).toISOString() }, userId, hardWinMoves, now), "expired-run", "future-start run");
  expectCode(() => verifyGameTranscript({ ...run, rules_version: 3 }, userId, hardWinMoves, now), "unsupported-version", "unsupported rules version");
  expectCode(() => verifyGameTranscript({ ...run, rng_version: 2 }, userId, hardWinMoves, now), "unsupported-version", "unsupported RNG version");
}

function greedyDailyTranscript(config: GameConfig): Position[] {
  let state = createGameState(config);
  const moves: Position[] = [];
  while (state.status === "playing") {
    const candidates: Array<Position & { tileValue: number }> = [];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if (isValidMove(state, { x, y })) candidates.push({ x, y, tileValue: state.board[y][x] });
      }
    }
    candidates.sort((a, b) => a.tileValue - b.tileValue || a.y - b.y || a.x - b.x);
    const next = candidates[0];
    assert(Boolean(next), "daily board always has a legal move before terminal state");
    const position = { x: next.x, y: next.y };
    moves.push(position);
    state = applyMove(state, position).state;
  }
  return moves;
}

function testDailyConfigurationAndDate() {
  const config = createDailyGameConfig("2026-11-05");
  const run = makeRun(config);
  const result = verifyGameTranscript(run, userId, greedyDailyTranscript(config), now);
  assert(result.gameMode === "daily" && result.difficulty === "medium", "valid Daily configuration is accepted");

  expectCode(
    () => verifyGameTranscript({ ...run, daily_date: "2026-11-04" }, userId, greedyDailyTranscript(config), now),
    "invalid-run-config",
    "Daily date mismatch"
  );
  expectCode(
    () => verifyGameTranscript({ ...run, difficulty: "hard" }, userId, greedyDailyTranscript(config), now),
    "invalid-run-config",
    "Daily difficulty mismatch"
  );
  expectCode(
    () => verifyGameTranscript({ ...run, seed: Number(run.seed) + 1 }, userId, greedyDailyTranscript(config), now),
    "invalid-run-config",
    "Daily seed mismatch"
  );
}

function testServerDerivedScoreAndImpossibleTranscript() {
  const config = createStandardGameConfig("Hard", 1);
  const run = makeRun(config);
  const result = verifyGameTranscript(run, userId, hardWinMoves, now);
  assert(result.score >= 200 && result.score <= 400, "score is canonical replay output under SQL ceiling");
  expectCode(
    () => verifyGameTranscript(run, userId, [...hardWinMoves, { x: 1, y: 1 }], now),
    "invalid-transcript",
    "extra move beyond the difficulty move limit"
  );
}

function testConsumedRunRetry() {
  const config = createStandardGameConfig("Hard", 1);
  const pendingRun = makeRun(config);
  const original = verifyGameTranscript(pendingRun, userId, hardWinMoves, now);
  const finalizedRun: StoredGameRun = {
    ...pendingRun,
    consumed_at: now.toISOString(),
    score_id: "00000000-0000-4000-8000-000000000099",
    final_result: {
      score: original.score,
      status: original.status,
      moves_played: original.movesPlayed,
      moves_remaining: original.movesRemaining,
      tiles_claimed: original.tilesClaimed,
      rules_version: config.rulesVersion,
      rng_version: config.rngVersion
    }
  };
  const retryAfterExpiry = verifyConsumedRunRetry(
    { ...finalizedRun, expires_at: new Date(now.getTime() - 1).toISOString() },
    userId,
    hardWinMoves,
    new Date(now.getTime() + 24 * 60 * 60 * 1000)
  );
  assert(retryAfterExpiry.score === original.score, "matching consumed transcript is replayed idempotently");

  expectCode(
    () => verifyConsumedRunRetry({
      ...finalizedRun,
      final_result: { ...finalizedRun.final_result as Record<string, unknown>, score: 220 }
    }, userId, hardWinMoves, now),
    "consumed-run",
    "consumed run with mismatched stored result"
  );

  const dailyConfig = createDailyGameConfig("2026-11-05");
  const dailyMoves = greedyDailyTranscript(dailyConfig);
  const dailyResult = verifyGameTranscript(makeRun(dailyConfig), userId, dailyMoves, now);
  const finalizedDailyRun = makeRun(dailyConfig, {
    consumed_at: now.toISOString(),
    score_id: "00000000-0000-4000-8000-000000000098",
    final_result: {
      score: dailyResult.score,
      status: dailyResult.status,
      moves_played: dailyResult.movesPlayed,
      moves_remaining: dailyResult.movesRemaining,
      tiles_claimed: dailyResult.tilesClaimed,
      rules_version: dailyConfig.rulesVersion,
      rng_version: dailyConfig.rngVersion
    }
  });
  const dailyRetry = verifyConsumedRunRetry(
    { ...finalizedDailyRun, expires_at: new Date(now.getTime() - 1).toISOString() },
    userId,
    dailyMoves,
    new Date(now.getTime() + 24 * 60 * 60 * 1000)
  );
  assert(dailyRetry.gameMode === "daily", "matching consumed Daily transcript can retry after date rollover");
}

testValidWinAndLoss();
testIllegalAndIncompleteTranscripts();
testRequestValidationRejectsClientResults();
testRunOwnershipAndLifecycle();
testDailyConfigurationAndDate();
testServerDerivedScoreAndImpossibleTranscript();
testConsumedRunRetry();
console.log("submit-game verifier tests passed");
