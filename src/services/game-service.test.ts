import { startVerifiedGame, submitVerifiedGame } from "./game-service.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  let dailyDifficultyRejected = false;
  try {
    await startVerifiedGame("daily", "Easy");
  } catch (error) {
    dailyDifficultyRejected = error instanceof Error && error.message === "Daily mode uses Medium difficulty.";
  }
  assert(dailyDifficultyRejected, "Daily mode rejects non-Medium difficulty before making a request");

  let unavailableStartRejected = false;
  try {
    await startVerifiedGame("standard", "Easy");
  } catch (error) {
    unavailableStartRejected = error instanceof Error && error.message.includes("not configured");
  }
  assert(unavailableStartRejected, "verified game start requires configured Supabase");

  let unavailableSubmissionRejected = false;
  try {
    await submitVerifiedGame("00000000-0000-4000-8000-000000000001", [{ x: 4, y: 3 }]);
  } catch (error) {
    unavailableSubmissionRejected = error instanceof Error && error.message.includes("not configured");
  }
  assert(unavailableSubmissionRejected, "verified submission requires configured Supabase");

  console.log("game service tests passed (offline/configuration mode)");
}

void run();
