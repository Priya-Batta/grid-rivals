type DailyProgressStorage = Pick<Storage, "getItem" | "setItem">;

export function recordDailyCompletion(
  storage: DailyProgressStorage,
  today = new Date().toISOString().slice(0, 10)
): number {
  const lastPlayed = storage.getItem("grid-rivals-last-daily");
  let streak = Number(storage.getItem("grid-rivals-daily-streak") || 0);

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

    storage.setItem("grid-rivals-last-daily", today);
    storage.setItem("grid-rivals-daily-streak", String(streak));

    const total = Number(
      storage.getItem("grid-rivals-daily-total") || 0
    );

    storage.setItem("grid-rivals-daily-total", String(total + 1));
  }

  return streak;
}
