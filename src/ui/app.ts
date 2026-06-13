// App: controller wiring data + pages + view, plus navigation, keybindings,
// mouse actions, and cache-freshness handling. Port of fifawc.py FifaWCApp.

import {
  CACHE_TTL_MS,
  isStale,
  loadData,
  loadFavourite,
  resolveSource,
  saveFavourite,
  type Source,
} from "../data/load.ts";
import { WorldCup } from "../data/worldcup.ts";
import { Pages } from "../pages/pages.ts";
import type { Page } from "../pages/page.ts";
import { View, type ActionName } from "./render.ts";

interface Frame {
  page: Page;
  cursor: number;
}

const PERIODIC_CHECK_MS = 5 * 60 * 1000; // 5 min while visible

export class App {
  private view: View;
  private source: Source;

  private wc: WorldCup | null = null;
  private pages: Pages | null = null;
  private stack: Frame[] = [];
  private favourite: string | null = loadFavourite();

  private fetchedAt: Date | null = null;
  private fromCache = false;
  private loading = false;
  private periodicTimer = 0;

  constructor(root: HTMLElement) {
    this.source = resolveSource();
    this.view = new View(root, {
      onRowClick: (i) => this.setCursor(i),
      onRowActivate: (i) => this.activate(i),
      onBreadcrumbClick: (i) => this.jumpTo(i),
      onAction: (a) => this.handleAction(a),
    });
    this.startClock();
    this.installGlobalListeners();
    void this.loadAndRender(false, true);
  }

  // -- data loading -------------------------------------------------------- //
  private async loadAndRender(force: boolean, initial = false): Promise<void> {
    if (this.loading) return;
    void initial;
    this.loading = true;
    this.view.showLoading(`Fetching ${this.source.label} …`);
    try {
      const result = await loadData(this.source, force);
      this.wc = new WorldCup(
        result.data.name ?? "World Cup",
        result.data.matches ?? [],
      );
      this.pages = new Pages(this.wc, this.favourite);
      this.fetchedAt = result.fetchedAt;
      this.fromCache = result.fromCache;
      this.loading = false;
      // Like the Python app, (re)loading resets to the main menu.
      this.stack = [{ page: this.pages.mainMenu(), cursor: 0 }];
      this.render();
    } catch (err) {
      this.loading = false;
      this.view.showError(
        `Failed to load data:\n${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Re-fetch only if the cache is stale (used on wake/return/timer). */
  private maybeRefresh(): void {
    if (this.loading) return;
    if (isStale(this.source, CACHE_TTL_MS)) {
      void this.loadAndRender(false);
    }
  }

  // -- rendering ----------------------------------------------------------- //
  private get current(): Frame | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  private render(): void {
    const frame = this.current;
    if (!frame) return;
    const page = frame.page;
    this.view.renderPage(page, {
      stackTitles: this.stack.map((f) => f.page.title),
      cursorIndex: frame.cursor,
      statusText: this.statusText(),
      canBack: this.stack.length > 1,
      canRelated: !!page.related,
      relatedLabel: page.related?.label ?? "",
      canFavourite:
        !!page.favTeam || (page.title === "Countries" && page.rows.length > 0),
    });
  }

  private statusText(): string {
    if (this.loading) return "refreshing…";
    if (!this.fetchedAt) return "";
    const d = this.fetchedAt;
    const stamp =
      `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
      `${p2(d.getHours())}:${p2(d.getMinutes())}`;
    return `${this.fromCache ? "cache" : "live"} ${stamp}`;
  }

  // -- navigation ---------------------------------------------------------- //
  private activate(index: number): void {
    const frame = this.current;
    if (!frame || !frame.page.onSelect || frame.page.rows.length === 0) return;
    if (index < 0 || index >= frame.page.rows.length) return;
    frame.cursor = index;
    const key = frame.page.rows[index].key;
    const next = frame.page.onSelect(key);
    if (next) {
      this.stack.push({ page: next, cursor: 0 });
      this.render();
    }
  }

  private back(): void {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.render();
    }
  }

  private home(): void {
    if (this.pages) {
      this.stack = [{ page: this.pages.mainMenu(), cursor: 0 }];
      this.render();
    }
  }

  private jumpTo(stackIndex: number): void {
    if (stackIndex < 0 || stackIndex >= this.stack.length - 1) return;
    this.stack = this.stack.slice(0, stackIndex + 1);
    this.render();
  }

  private related(): void {
    const frame = this.current;
    if (!frame?.page.related) return;
    const next = frame.page.related.build();
    this.stack.push({ page: next, cursor: 0 });
    this.render();
  }

  private setCursor(index: number): void {
    const frame = this.current;
    if (!frame) return;
    const count = frame.page.rows.length;
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(index, count - 1));
    frame.cursor = clamped;
    this.view.setCursor(clamped);
  }

  private moveCursor(delta: number): void {
    const frame = this.current;
    if (!frame) return;
    this.setCursor(frame.cursor + delta);
  }

  // -- favourite ----------------------------------------------------------- //
  private toggleFavourite(): void {
    const frame = this.current;
    if (!frame || !this.pages) return;
    const page = frame.page;
    let team: string | undefined = page.favTeam;
    if (!team && page.title === "Countries") {
      const row = page.rows[frame.cursor];
      if (row) team = row.key as string;
    }
    if (!team) return;

    if (this.favourite === team) {
      this.favourite = null;
      this.pages.favourite = null;
      saveFavourite(null);
      this.view.toast("Cleared favourite");
    } else {
      this.favourite = team;
      this.pages.favourite = team;
      saveFavourite(team);
      this.view.toast(`⭐ ${team} set as favourite`);
    }

    // Rebuild main menu so favourite items appear immediately.
    this.stack[0] = { page: this.pages.mainMenu(), cursor: this.stack[0].cursor };
    // Refresh current country-detail page (title/note depend on favourite).
    if (this.stack.length > 1 && page.favTeam) {
      frame.page = this.pages.countryDetail(team);
    }
    this.render();
  }

  // -- actions / input ----------------------------------------------------- //
  private handleAction(action: ActionName): void {
    switch (action) {
      case "back":
        this.back();
        break;
      case "home":
        this.home();
        break;
      case "related":
        this.related();
        break;
      case "favourite":
        this.toggleFavourite();
        break;
      case "refresh":
        void this.loadAndRender(true);
        break;
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const frame = this.current;
    switch (e.key) {
      case "Enter":
        if (frame) this.activate(frame.cursor);
        break;
      case "Escape":
      case "Backspace":
        this.back();
        break;
      case "g":
        this.home();
        break;
      case "G": // Shift+G
        this.related();
        break;
      case "f":
        this.toggleFavourite();
        break;
      case "r":
        void this.loadAndRender(true);
        break;
      case "j":
      case "ArrowDown":
        this.moveCursor(1);
        break;
      case "k":
      case "ArrowUp":
        this.moveCursor(-1);
        break;
      default:
        return; // don't preventDefault for unhandled keys
    }
    e.preventDefault();
  }

  // -- lifecycle ----------------------------------------------------------- //
  private installGlobalListeners(): void {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.maybeRefresh();
    });
    window.addEventListener("focus", () => this.maybeRefresh());
    window.addEventListener("pageshow", () => this.maybeRefresh());

    this.periodicTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") this.maybeRefresh();
    }, PERIODIC_CHECK_MS);
  }

  /** Stop background timers (not used yet; here for completeness). */
  dispose(): void {
    window.clearInterval(this.periodicTimer);
  }

  private startClock(): void {
    const tick = () => {
      const d = new Date();
      this.view.setClock(`${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`);
    };
    tick();
    window.setInterval(tick, 1000);
  }
}

function p2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
