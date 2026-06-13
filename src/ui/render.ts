// View: owns the DOM and renders pages in a terminal style.
// Logic/state lives in app.ts; the View emits user intents via callbacks.

import type { Page } from "../pages/page.ts";

export interface ViewCallbacks {
  /** A row was clicked (select it). */
  onRowClick: (index: number) => void;
  /** A row was activated (Enter / click-selected / double-click). */
  onRowActivate: (index: number) => void;
  /** A breadcrumb segment was clicked (index into the nav stack). */
  onBreadcrumbClick: (stackIndex: number) => void;
  /** A footer action chip was clicked / an action requested. */
  onAction: (action: ActionName) => void;
}

export type ActionName =
  | "back"
  | "home"
  | "related"
  | "favourite"
  | "refresh";

export interface RenderContext {
  stackTitles: string[];
  cursorIndex: number;
  statusText: string;
  canBack: boolean;
  canRelated: boolean;
  relatedLabel: string;
  canFavourite: boolean;
}

interface Chip {
  el: HTMLElement;
  action?: ActionName;
}

export class View {
  private root: HTMLElement;
  private cb: ViewCallbacks;

  private clockEl!: HTMLElement;
  private breadcrumbEl!: HTMLElement;
  private noteEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private tableWrap!: HTMLElement;
  private tableEl!: HTMLTableElement;
  private detailBelowEl!: HTMLElement;
  private loadingEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private chips!: Record<string, Chip>;

  private rowEls: HTMLTableRowElement[] = [];
  private cursorIndex = -1;

  constructor(root: HTMLElement, cb: ViewCallbacks) {
    this.root = root;
    this.cb = cb;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = "";
    this.root.classList.add("tui");

    // Header
    const header = el("header", "tui-header");
    const titleEl = el("div", "tui-title");
    titleEl.textContent = "FIFA World Cup";
    this.clockEl = el("div", "tui-clock");
    header.append(titleEl, this.clockEl);

    // Breadcrumb + note
    this.breadcrumbEl = el("div", "tui-breadcrumb");
    this.breadcrumbEl.id = "breadcrumb";
    this.noteEl = el("div", "tui-note");

    // Detail panes + table
    this.detailEl = el("div", "tui-detail");
    this.tableWrap = el("div", "tui-table-wrap");
    this.tableEl = document.createElement("table");
    this.tableEl.className = "tui-table";
    this.tableWrap.append(this.tableEl);
    this.detailBelowEl = el("div", "tui-detail-below");

    // Loading overlay
    this.loadingEl = el("div", "tui-loading");
    this.loadingEl.style.display = "none";

    // Footer
    const footer = el("footer", "tui-footer");
    const chipBar = el("div", "tui-chips");
    this.chips = {};
    const chipDefs: Array<[string, string, ActionName | undefined]> = [
      ["enter", "↵ Drill down", undefined],
      ["esc", "⎋ Back", "back"],
      ["g", "g Main menu", "home"],
      ["G", "⇧G Open group", "related"],
      ["f", "f ★ Favourite", "favourite"],
      ["r", "r Refresh", "refresh"],
    ];
    for (const [id, label, action] of chipDefs) {
      const c = el("span", "tui-chip");
      c.dataset.chip = id;
      c.textContent = label;
      if (action) {
        c.addEventListener("click", () => this.cb.onAction(action));
      } else {
        // 'enter' chip activates the current cursor row.
        c.addEventListener("click", () => {
          if (this.cursorIndex >= 0) this.cb.onRowActivate(this.cursorIndex);
        });
      }
      this.chips[id] = { el: c, action };
      chipBar.append(c);
    }
    this.statusEl = el("div", "tui-status");
    footer.append(chipBar, this.statusEl);

    this.root.append(
      header,
      this.breadcrumbEl,
      this.noteEl,
      this.detailEl,
      this.tableWrap,
      this.detailBelowEl,
      this.loadingEl,
      footer,
    );
  }

  setClock(text: string): void {
    this.clockEl.textContent = text;
  }

  private toastTimer = 0;
  toast(message: string): void {
    let t = this.root.querySelector<HTMLElement>(".tui-toast");
    if (!t) {
      t = el("div", "tui-toast");
      this.root.append(t);
    }
    t.textContent = message;
    t.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      t!.classList.remove("show");
    }, 2000);
  }

  showLoading(message: string): void {
    this.loadingEl.textContent = message || "Loading…";
    this.loadingEl.style.display = "";
    this.tableWrap.style.display = "none";
  }

  hideLoading(): void {
    this.loadingEl.style.display = "none";
    this.tableWrap.style.display = "";
  }

  showError(message: string): void {
    this.hideLoading();
    this.breadcrumbEl.textContent = "Error";
    this.noteEl.textContent = "Press r to retry.";
    this.detailEl.style.display = "";
    this.detailEl.innerHTML = `<span class="m-red">${escapeHtml(message)}</span>`;
    this.tableWrap.style.display = "none";
    this.detailBelowEl.style.display = "none";
    this.statusEl.textContent = "";
  }

  renderPage(page: Page, ctx: RenderContext): void {
    this.hideLoading();
    this.cursorIndex = ctx.cursorIndex;

    // Breadcrumb (clickable ancestors)
    this.breadcrumbEl.innerHTML = "";
    ctx.stackTitles.forEach((title, i) => {
      if (i > 0) {
        const sep = el("span", "tui-crumb-sep");
        sep.textContent = " ▸ ";
        this.breadcrumbEl.append(sep);
      }
      const seg = el("span", "tui-crumb");
      seg.textContent = title;
      const last = i === ctx.stackTitles.length - 1;
      if (last) seg.classList.add("current");
      else seg.addEventListener("click", () => this.cb.onBreadcrumbClick(i));
      this.breadcrumbEl.append(seg);
    });

    // Note
    this.noteEl.textContent = page.note ?? "";

    // Detail (above table)
    this.renderMarkupBlock(this.detailEl, page.detail);

    // Table
    this.renderTable(page, ctx.cursorIndex);

    // Detail below
    this.renderMarkupBlock(this.detailBelowEl, page.detailBelow);

    // Footer status + context chips
    this.statusEl.textContent = ctx.statusText;
    this.setChipEnabled("enter", page.rows.length > 0 && !!page.onSelect);
    this.setChipEnabled("esc", ctx.canBack);
    this.setChipVisible("G", ctx.canRelated);
    if (ctx.canRelated) {
      this.chips["G"].el.textContent = `⇧G ${ctx.relatedLabel}`;
    }
    this.setChipVisible("f", ctx.canFavourite);
  }

  private renderTable(page: Page, cursorIndex: number): void {
    this.tableEl.innerHTML = "";
    this.rowEls = [];
    if (page.rows.length === 0) {
      this.tableWrap.style.display = "none";
      return;
    }
    this.tableWrap.style.display = "";

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    for (const col of page.columns) {
      const th = document.createElement("th");
      th.textContent = col;
      htr.append(th);
    }
    thead.append(htr);
    this.tableEl.append(thead);

    const tbody = document.createElement("tbody");
    page.rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      if (i === cursorIndex) tr.classList.add("cursor");
      for (const cell of row.cells) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.append(td);
      }
      tr.addEventListener("click", () => {
        if (i === this.cursorIndex) this.cb.onRowActivate(i);
        else this.cb.onRowClick(i);
      });
      tr.addEventListener("dblclick", () => this.cb.onRowActivate(i));
      tbody.append(tr);
      this.rowEls.push(tr);
    });
    this.tableEl.append(tbody);
  }

  /** Update only cursor highlight (used by j/k/arrows). */
  setCursor(index: number): void {
    if (this.cursorIndex >= 0 && this.rowEls[this.cursorIndex]) {
      this.rowEls[this.cursorIndex].classList.remove("cursor");
    }
    this.cursorIndex = index;
    const tr = this.rowEls[index];
    if (tr) {
      tr.classList.add("cursor");
      tr.scrollIntoView({ block: "nearest" });
    }
  }

  get rowCount(): number {
    return this.rowEls.length;
  }

  private renderMarkupBlock(target: HTMLElement, lines?: string[]): void {
    if (!lines || lines.length === 0) {
      target.style.display = "none";
      target.innerHTML = "";
      return;
    }
    target.style.display = "";
    target.innerHTML = lines.map(markupToHtml).join("\n");
  }

  private setChipEnabled(id: string, enabled: boolean): void {
    this.chips[id].el.classList.toggle("disabled", !enabled);
  }

  private setChipVisible(id: string, visible: boolean): void {
    this.chips[id].el.style.display = visible ? "" : "none";
  }
}

// -- helpers ---------------------------------------------------------------- //
function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convert Textual-style [b]/[bold]/[dim]/[red] markup to HTML spans. */
function markupToHtml(line: string): string {
  // Escape first, then translate a known, safe set of tags.
  let s = escapeHtml(line);
  s = s
    .replace(/\[b\]/g, "<b>")
    .replace(/\[\/b\]/g, "</b>")
    .replace(/\[bold\]/g, "<b>")
    .replace(/\[\/bold\]/g, "</b>")
    .replace(/\[dim\]/g, '<span class="m-dim">')
    .replace(/\[\/dim\]/g, "</span>")
    .replace(/\[red\]/g, '<span class="m-red">')
    .replace(/\[\/red\]/g, "</span>");
  return s;
}
