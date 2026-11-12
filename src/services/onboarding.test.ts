import assert from "node:assert/strict";
import { markHowToPlaySeen, shouldShowHowToPlay } from "./onboarding.ts";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value)
};

assert.equal(shouldShowHowToPlay(storage), true, "new players should see the welcome panel");
markHowToPlaySeen(storage);
assert.equal(shouldShowHowToPlay(storage), false, "returning players should not be interrupted");
assert.equal(values.get("grid-rivals-how-to-play-seen"), "true");

console.log("onboarding tests passed");
