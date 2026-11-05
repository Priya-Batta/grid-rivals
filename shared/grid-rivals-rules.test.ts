import {
  applyMove,
  calculateTileScore,
  createDailyGameConfig,
  createGameState,
  createStandardGameConfig,
  dailySeedForDate,
  determineGameCompletion,
  generateBoard,
  isValidMove,
  maxFinalScore,
  maxMovesForDifficulty,
  replayMoveTranscript,
  type GameBoard,
  type GameConfig,
  type GameState,
  type Position
} from "../supabase/functions/_shared/grid-rivals-rules.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function sameBoard(left: GameBoard, right: GameBoard): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stateWithUniformBoard(config: GameConfig, value: number): GameState {
  const state = createGameState(config);
  const start = 4;
  const board = Array.from({ length: 8 }, () => Array<number>(8).fill(value));
  board[start][start] = 0;
  return { ...state, board };
}

const longPath: Position[] = [
  { x: 4, y: 3 }, { x: 4, y: 2 }, { x: 4, y: 1 }, { x: 4, y: 0 },
  { x: 3, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 },
  { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 },
  { x: 0, y: 5 }, { x: 0, y: 6 }, { x: 0, y: 7 }, { x: 1, y: 7 },
  { x: 2, y: 7 }, { x: 3, y: 7 }
];

function legacyDailyBoard(utcDate: string): number[][] {
  let value = dailySeedForDate(utcDate);
  const random = () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };

  const board: number[][] = [];
  for (let y = 0; y < 8; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < 8; x += 1) {
      row.push(x === 4 && y === 4 ? 0 : Math.floor(random() * 3) + 1);
    }
    board.push(row);
  }
  return board;
}

function testSeededBoards() {
  const first = createStandardGameConfig("Medium", 123456);
  const same = createStandardGameConfig("Medium", 123456);
  const different = createStandardGameConfig("Medium", 123457);
  const firstBoard = generateBoard(first);

  assert(sameBoard(firstBoard, generateBoard(same)), "same seed produces the same board");
  assert(!sameBoard(firstBoard, generateBoard(different)), "different seeds produce different boards");
  assert(firstBoard.length === 8 && firstBoard.every((row) => row.length === 8), "board is 8 by 8");
  assert(firstBoard[4][4] === 0, "center tile has value zero");
  assert(firstBoard.flat().filter((tile) => tile > 0).every((tile) => tile <= 3), "Medium tiles use values 1 through 3");
}

function testDailyCompatibility() {
  const date = "2026-11-05";
  const config = createDailyGameConfig(date);
  const board = generateBoard(config);

  assert(sameBoard(board, generateBoard(createDailyGameConfig(date))), "daily board is reproducible");
  assert(sameBoard(board, legacyDailyBoard(date)), "daily board matches the existing LCG behavior");
  assert(config.seed === 20261105, "daily seed is the existing UTC YYYYMMDD value");
}

function testStartingStateAndValidMoves() {
  const state = createGameState(createStandardGameConfig("Medium", 7));
  assert(state.claimed[4][4], "center tile starts claimed");
  assert(state.score === 0 && state.movesRemaining === 12, "Medium starts at zero score and 12 moves");
  assert(isValidMove(state, { x: 4, y: 3 }), "orthogonally adjacent move is valid");
  assert(!isValidMove(state, { x: 0, y: 0 }), "non-adjacent move is invalid");
  assert(!isValidMove(state, { x: 4, y: 4 }), "already claimed starting tile is invalid");
  assert(!isValidMove(state, { x: -1, y: 4 }), "out-of-bounds move is invalid");
  assert(!isValidMove(state, { x: 4.5, y: 3 }), "non-integer coordinate is invalid");

  const result = applyMove(state, { x: 4, y: 3 });
  assert(result.accepted, "valid move is accepted");
  assert(result.state.movesRemaining === 11, "valid move consumes one move");
  assert(result.state.score === state.board[3][4] * 10, "move score is tile value times ten");
  assert(result.state.claimed[3][4], "accepted tile becomes claimed");
}

function testInvalidAndRepeatedMoves() {
  const state = createGameState(createStandardGameConfig("Easy", 12));
  const invalid = applyMove(state, { x: 0, y: 0 });
  assert(!invalid.accepted && invalid.state === state, "invalid move leaves state unchanged");

  const first = applyMove(state, { x: 4, y: 3 });
  const repeated = applyMove(first.state, { x: 4, y: 3 });
  assert(!repeated.accepted, "repeated tile claim is rejected");
  assert(repeated.state.score === first.state.score, "repeated claim adds no score");
  assert(repeated.state.movesRemaining === first.state.movesRemaining, "repeated claim consumes no move");
}

function testScoringAndMoveLimits() {
  assert(calculateTileScore(0) === 0, "start tile scores zero");
  assert(calculateTileScore(1) === 10, "value 1 scores 10");
  assert(calculateTileScore(3) === 30, "value 3 scores 30");
  assert(calculateTileScore(5) === 50, "value 5 scores 50");
  assert(maxFinalScore("Easy") === 540, "Easy final-score ceiling uses all 18 moves");
  assert(maxFinalScore("Medium") === 360, "Medium final-score ceiling uses all 12 moves");
  assert(maxFinalScore("Hard") === 400, "Hard final-score ceiling uses all 8 moves");

  const limits = [
    ["Easy", 18], ["Medium", 12], ["Hard", 8]
  ] as const;
  for (const [difficulty, moves] of limits) {
    assert(maxMovesForDifficulty(difficulty) === moves, `${difficulty} rule helper matches its move limit`);
    const state = createGameState(createStandardGameConfig(difficulty, 123));
    assert(state.movesRemaining === moves, `${difficulty} starts with ${moves} moves`);
  }

  let state = stateWithUniformBoard(createStandardGameConfig("Easy", 2), 1);
  for (let index = 0; index < longPath.length; index += 1) {
    const result = applyMove(state, longPath[index]);
    assert(result.accepted, `move ${index + 1} of the Easy path is legal`);
    state = result.state;
    assert(state.movesRemaining === 17 - index, "each accepted move consumes exactly one move");
  }
  assert(state.movesRemaining === 0 && state.score === 180, "Easy game ends after its eighteenth move");
  assert(state.status === "lost", "below-target game with no moves is a loss/game over");
  assert(!applyMove(state, { x: 3, y: 6 }).accepted, "no move is accepted after game completion");
}

function testWinConditions() {
  let state = stateWithUniformBoard(createStandardGameConfig("Easy", 3), 3);
  for (const position of longPath.slice(0, 7)) {
    const result = applyMove(state, position);
    assert(result.accepted, "target-reaching transcript move is legal");
    state = result.state;
  }
  assert(state.score === 210, "score reaches the 200-point target");
  assert(state.movesRemaining === 11, "moves remain after reaching the target");
  assert(state.status === "playing", "game continues after reaching the target");
  assert(isValidMove(state, longPath[7]), "player can make another move after reaching the target");

  for (const position of longPath.slice(7)) {
    const result = applyMove(state, position);
    assert(result.accepted, "remaining move is accepted after reaching the target");
    state = result.state;
  }
  assert(state.movesRemaining === 0, "game uses all 18 Easy moves");
  assert(state.status === "won", "reaching the target by the final move wins");
  assert(determineGameCompletion(200, 11) === "playing", "target does not end a game with moves remaining");
  assert(determineGameCompletion(200, 0) === "won", "target score wins when all moves are used");
  assert(determineGameCompletion(190, 0) === "lost", "zero moves below target ends the game");
  assert(determineGameCompletion(190, 1) === "playing", "game continues below target with moves left");
}

function testTranscriptReplay() {
  const config = createStandardGameConfig("Hard", 98765);
  let state = createGameState(config);
  while (state.status === "playing") {
    let nextMove: Position | undefined;
    for (let y = 0; y < 8 && !nextMove; y += 1) {
      for (let x = 0; x < 8 && !nextMove; x += 1) {
        if (isValidMove(state, { x, y })) nextMove = { x, y };
      }
    }
    assert(Boolean(nextMove), "a legal next move exists until this board ends");
    state = applyMove(state, nextMove!).state;
  }

  const replay = replayMoveTranscript(config, state.moveHistory);
  assert(replay.valid && replay.complete, "complete legal transcript replays successfully");
  assert(replay.state.score === state.score, "replay recalculates the same score");
  assert(replay.state.movesRemaining === state.movesRemaining, "replay recalculates remaining moves");

  const partial = replayMoveTranscript(config, state.moveHistory.slice(0, 1));
  assert(partial.valid && !partial.complete && partial.error === "incomplete", "legal partial transcript is not a completed game");

  const invalid = replayMoveTranscript(config, [{ x: 0, y: 0 }]);
  assert(!invalid.valid && invalid.error === "invalid-move", "replay rejects non-adjacent opening move");

  const afterCompletion = replayMoveTranscript(config, [
    ...state.moveHistory,
    { x: 0, y: 0 }
  ]);
  assert(!afterCompletion.valid && afterCompletion.error === "moves-after-completion", "replay rejects moves after terminal state");
}

testSeededBoards();
testDailyCompatibility();
testStartingStateAndValidMoves();
testInvalidAndRepeatedMoves();
testScoringAndMoveLimits();
testWinConditions();
testTranscriptReplay();
console.log("shared game rules tests passed");