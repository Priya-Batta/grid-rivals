import {
  ensurePlayerProfile,
  fetchLeaderboard,
  fetchPlayerSummary,
  getStoredDisplayName,
  isLeaderboardConfigured,
  refreshLeaderboardData,
  updatePlayerDisplayName,
  type LeaderboardDifficulty,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type PlayerRecord
} from "./leaderboard";

type LeaderboardViewOptions = {
  playerLevel: number;
  localBests: Record<string, number>;
  onClose: () => void;
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function option(value: string, label: string): HTMLOptionElement {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

export class LeaderboardView {
  private readonly root = element("section", "leaderboard-overlay");
  private readonly options: LeaderboardViewOptions;
  private readonly onClose: () => void;
  private readonly playerName = element("input");
  private readonly nameStatus = element("p", "leaderboard-status");
  private readonly connectionStatus = element("p", "leaderboard-status");
  private readonly pendingStatus = element("p", "leaderboard-status");
  private readonly list = element("div", "leaderboard-list");
  private readonly summaryBest = element("strong");
  private readonly summaryRank = element("strong");
  private readonly summaryLevel = element("strong");
  private readonly period = element("select");
  private readonly difficulty = element("select");
  private player: PlayerRecord | null = null;
  private requestId = 0;
  private destroyed = false;

  constructor(container: HTMLElement, options: LeaderboardViewOptions) {
    this.options = options;
    this.onClose = options.onClose;
    this.build();
    container.append(this.root);
    void this.initialize();
  }

  destroy() {
    this.destroyed = true;
    this.requestId += 1;
    this.root.remove();
  }

  private build() {
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "leaderboard-title");

    const shell = element("div", "leaderboard-shell");
    const header = element("header", "leaderboard-header");
    const heading = element("div");
    const title = element("h1");
    title.id = "leaderboard-title";
    title.textContent = "GLOBAL LEADERBOARD";
    const subtitle = element("p");
    subtitle.textContent = "GRID RIVALS WORLDWIDE";
    heading.append(title, subtitle);

    const close = element("button", "leaderboard-icon-button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close leaderboard");
    close.addEventListener("click", this.onClose);
    header.append(heading, close);

    const profile = element("section", "leaderboard-profile");
    const profileHeading = element("div", "leaderboard-section-heading");
    const profileTitle = element("h2");
    profileTitle.textContent = "PLAYER PROFILE";
    profileHeading.append(profileTitle);

    const form = element("form", "leaderboard-name-form");
    const nameLabel = element("label");
    nameLabel.htmlFor = "leaderboard-player-name";
    nameLabel.textContent = "DISPLAY NAME";
    this.playerName.id = "leaderboard-player-name";
    this.playerName.name = "displayName";
    this.playerName.autocomplete = "on";
    this.playerName.maxLength = 20;
    this.playerName.minLength = 3;
    this.playerName.placeholder = "Rival name";
    const saveName = element("button", "leaderboard-button");
    saveName.type = "submit";
    saveName.textContent = "SAVE NAME";
    form.append(nameLabel, this.playerName, saveName);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.saveName();
    });
    this.nameStatus.setAttribute("aria-live", "polite");

    const stats = element("div", "leaderboard-profile-stats");
    stats.append(
      this.stat("PERSONAL BEST", this.summaryBest),
      this.stat("GLOBAL RANK", this.summaryRank),
      this.stat("PLAYER LEVEL", this.summaryLevel)
    );
    profile.append(profileHeading, form, this.nameStatus, stats);

    const toolbar = element("div", "leaderboard-toolbar");
    const filters = element("div", "leaderboard-filters");
    const periodLabel = this.filterLabel("TIME PERIOD", this.period);
    this.period.append(
      option("all", "ALL-TIME"),
      option("today", "TODAY"),
      option("week", "THIS WEEK")
    );
    const difficultyLabel = this.filterLabel("DIFFICULTY", this.difficulty);
    this.difficulty.append(
      option("all", "ALL MODES"),
      option("easy", "EASY"),
      option("medium", "MEDIUM"),
      option("hard", "HARD")
    );
    filters.append(periodLabel, difficultyLabel);
    this.period.addEventListener("change", () => void this.loadBoard());
    this.difficulty.addEventListener("change", () => void this.loadBoard());

    const refresh = element("button", "leaderboard-button leaderboard-button--quiet");
    refresh.type = "button";
    refresh.textContent = "↻ REFRESH";
    refresh.addEventListener("click", () => void this.retryAndRefresh());
    toolbar.append(filters, refresh);

    const entriesSection = element("section", "leaderboard-entries");
    const entriesHeading = element("div", "leaderboard-section-heading");
    const entriesTitle = element("h2");
    entriesTitle.textContent = "TOP 100 PLAYERS";
    const columns = element("p", "leaderboard-column-labels");
    columns.textContent = "RANK / PLAYER                         SCORE / MODE";
    entriesHeading.append(entriesTitle, columns);
    this.list.setAttribute("aria-live", "polite");
    entriesSection.append(entriesHeading, this.list);

    const footer = element("footer", "leaderboard-footer");
    this.connectionStatus.setAttribute("aria-live", "polite");
    this.pendingStatus.setAttribute("aria-live", "polite");
    footer.append(this.connectionStatus, this.pendingStatus);

    shell.append(header, profile, toolbar, entriesSection, footer);
    this.root.append(shell);
  }

  private stat(label: string, value: HTMLElement): HTMLElement {
    const wrapper = element("div", "leaderboard-stat");
    const caption = element("span");
    caption.textContent = label;
    value.textContent = "--";
    wrapper.append(caption, value);
    return wrapper;
  }

  private filterLabel(text: string, select: HTMLSelectElement): HTMLLabelElement {
    const label = element("label", "leaderboard-filter");
    const caption = element("span");
    caption.textContent = text;
    label.append(caption, select);
    return label;
  }

  private async initialize() {
    this.playerName.value = getStoredDisplayName() || "";
    this.pendingStatus.textContent = "ONLY SERVER-VERIFIED GAMES ENTER THE GLOBAL RANKINGS";
    if (!isLeaderboardConfigured()) {
      this.connectionStatus.textContent = "GLOBAL SCORES ARE NOT CONFIGURED YET. YOUR GAME AND LOCAL SCORES STILL WORK.";
      this.renderUnavailable();
      return;
    }

    this.connectionStatus.textContent = "CONNECTING TO THE GLOBAL LEADERBOARD...";
    try {
      this.player = await ensurePlayerProfile();
      if (this.destroyed) return;
      this.playerName.value = this.player.display_name;
      this.connectionStatus.textContent = navigator.onLine
        ? "ANONYMOUS PLAYER SESSION ACTIVE"
        : "OFFLINE. SAVED SCORES WILL RETRY WHEN YOU RECONNECT.";
      await this.loadBoard();
    } catch (error) {
      if (this.destroyed) return;
      this.connectionStatus.textContent = error instanceof Error
        ? `LEADERBOARD CONNECTION ISSUE: ${error.message}`
        : "LEADERBOARD CONNECTION ISSUE. YOUR GAME IS UNAFFECTED.";
      this.renderError();
    }
  }

  private async saveName() {
    this.nameStatus.textContent = "";
    try {
      const result = await updatePlayerDisplayName(this.playerName.value);
      this.playerName.value = result.displayName;
      this.nameStatus.textContent = result.synced
        ? "DISPLAY NAME UPDATED"
        : "SAVED ON THIS DEVICE. IT WILL SYNC WHEN CONNECTED.";
      if (result.synced) {
        if (this.player) this.player = { ...this.player, display_name: result.displayName };
        await this.loadBoard(true);
      }
    } catch (error) {
      this.nameStatus.textContent = error instanceof Error ? error.message : "Could not save this name.";
    }
  }

  private async loadBoard(forceRefresh = false) {
    if (!isLeaderboardConfigured()) return;
    const requestId = ++this.requestId;
    this.renderLoading();
    this.connectionStatus.textContent = "FETCHING GLOBAL SCORES...";

    const period = this.period.value as LeaderboardPeriod;
    const difficulty = this.difficulty.value as LeaderboardDifficulty;
    try {
      const [entries, summary] = await Promise.all([
        fetchLeaderboard(period, difficulty, forceRefresh),
        fetchPlayerSummary(period, difficulty)
      ]);
      if (this.destroyed || requestId !== this.requestId) return;
      this.renderEntries(entries);
      this.summaryBest.textContent = String(summary.best_score || this.localBest(difficulty));
      this.summaryRank.textContent = summary.player_rank ? `#${summary.player_rank}` : "UNRANKED";
      this.summaryLevel.textContent = String(summary.player_level || this.options.playerLevel);
      this.connectionStatus.textContent = navigator.onLine
        ? "GLOBAL LEADERBOARD ONLINE"
        : "SHOWING AVAILABLE RESULTS. YOU ARE OFFLINE.";
    } catch (error) {
      if (this.destroyed || requestId !== this.requestId) return;
      this.connectionStatus.textContent = error instanceof Error
        ? `COULD NOT LOAD SCORES: ${error.message}`
        : "COULD NOT LOAD SCORES. RETRY WHEN CONNECTED.";
      this.renderError();
    }
  }

  private localBest(difficulty: LeaderboardDifficulty): number {
    if (difficulty !== "all") return this.options.localBests[difficulty] || 0;
    return Math.max(0, ...Object.values(this.options.localBests));
  }

  private renderLoading() {
    const loading = element("p", "leaderboard-state");
    loading.setAttribute("role", "status");
    loading.textContent = "LOADING GLOBAL SCORES...";
    this.list.replaceChildren(loading);
  }

  private renderUnavailable() {
    this.summaryBest.textContent = String(this.localBest("all"));
    this.summaryLevel.textContent = String(this.options.playerLevel);
    this.summaryRank.textContent = "--";
    const state = element("div", "leaderboard-state");
    const message = element("p");
    message.textContent = "Connect a Supabase project to see global player rankings. Your personal scores remain saved locally.";
    state.append(message);
    this.list.replaceChildren(state);
  }

  private renderError() {
    const state = element("div", "leaderboard-state");
    const message = element("p");
    message.textContent = "Scores could not be loaded. Your game and saved local results are safe.";
    const retry = element("button", "leaderboard-button");
    retry.type = "button";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => void this.retryAndRefresh());
    state.append(message, retry);
    this.list.replaceChildren(state);
  }

  private renderEntries(entries: LeaderboardEntry[]) {
    if (entries.length === 0) {
      const empty = element("p", "leaderboard-state");
      empty.textContent = "NO SCORES YET. FINISH A GAME TO CLAIM THE FIRST SPOT.";
      this.list.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const entry of entries.slice(0, 100)) {
      const row = element("article", "leaderboard-row");
      if (entry.rank <= 3) row.classList.add(`leaderboard-row--top-${entry.rank}`);
      if (entry.is_current_user) row.classList.add("leaderboard-row--current");

      const rank = element("strong", "leaderboard-rank");
      rank.textContent = `#${entry.rank}`;
      const identity = element("div", "leaderboard-player");
      const name = element("strong");
      name.textContent = entry.display_name;
      const detail = element("span");
      const date = new Date(entry.achieved_at);
      const dateText = Number.isNaN(date.getTime()) ? "DATE UNKNOWN" : date.toLocaleDateString();
      detail.textContent = `LEVEL ${entry.player_level} · ${entry.game_mode.toUpperCase()} · ${dateText}`;
      identity.append(name, detail);

      const score = element("strong", "leaderboard-score");
      score.textContent = String(entry.score);
      row.append(rank, identity, score);
      fragment.append(row);
    }
    this.list.replaceChildren(fragment);
  }

  private async retryAndRefresh() {
    if (!navigator.onLine) {
      this.connectionStatus.textContent = "OFFLINE. GLOBAL SCORES WILL BE AVAILABLE WHEN CONNECTED.";
      return;
    }
    await refreshLeaderboardData();
    if (isLeaderboardConfigured()) await this.loadBoard(true);
  }
}
