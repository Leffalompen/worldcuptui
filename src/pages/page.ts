// Page model: a single navigable screen (port of fifawc.py Page dataclass).

export type PageBuilder = () => Page;

export interface RelatedLink {
  label: string; // e.g. "Open Group A"
  build: () => Page;
}

/**
 * A row is a tuple of display cells plus an opaque payload key passed to
 * `onSelect` when the row is activated.
 */
export interface Row {
  cells: string[];
  key: unknown;
}

export interface Page {
  title: string;
  columns: string[];
  rows: Row[];
  /** Drill-down: returns the next page, or null to stay. */
  onSelect?: (key: unknown) => Page | null;
  note?: string;
  /** Lines rendered above the table (may contain [b]/[dim]/[red] markup). */
  detail?: string[];
  /** Lines rendered below the table. */
  detailBelow?: string[];
  /** 'Shift+G' shortcut target. */
  related?: RelatedLink;
  /** Team that can be (un)favourited from this page. */
  favTeam?: string;
}
