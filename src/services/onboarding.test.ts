import { markHowToPlaySeen, shouldShowHowToPlay } from "./onboarding.ts";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

const values = new Map<string, string>();

const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value)
};

assertEqual(
  shouldShowHowToPlay(storage),
  true,
  "New players should see the welcome panel"
);

markHowToPlaySeen(storage);

assertEqual(
  shouldShowHowToPlay(storage),
  false,
  "Returning players should not be interrupted"
);

assertEqual(
  values.get("grid-rivals-how-to-play-seen"),
  "true",
  "Acknowledgement should be persisted"
);

console.log("onboarding tests passed");
