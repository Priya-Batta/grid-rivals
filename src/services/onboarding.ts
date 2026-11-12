const KEY = "grid-rivals-how-to-play-seen";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function shouldShowHowToPlay(storage: StorageReader = localStorage): boolean {
  return storage.getItem(KEY) !== "true";
}

export function markHowToPlaySeen(storage: StorageWriter = localStorage): void {
  storage.setItem(KEY, "true");
}
