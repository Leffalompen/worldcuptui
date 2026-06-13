// Data loading: source resolution, fetch + localStorage cache (TTL), favourite
// persistence, and freshness helpers. Port of fifawc.py data layer for the web.

import type { LoadResult, WorldCupData } from "./types.ts";

const URL_TEMPLATE = (year: string) =>
  `https://raw.githubusercontent.com/openfootball/worldcup.json/master/${year}/worldcup.json`;

const DEFAULT_YEAR = "2026";
export const CACHE_TTL_MS = 3600_000; // 1 hour

const CACHE_PREFIX = "fifawc:cache:";
const FAVOURITE_KEY = "fifawc:favourite";

export interface Source {
  /** URL fetched for this source. */
  fetchUrl: string;
  /** Human-readable label shown in the UI (the logical source). */
  label: string;
  /** Stable key for caching. */
  cacheKey: string;
}

/** Resolve the data source from the page URL (?year= or ?url=). */
export function resolveSource(search: string = location.search): Source {
  const params = new URLSearchParams(search);
  const url = params.get("url");
  if (url) {
    return { fetchUrl: url, label: url, cacheKey: `url:${url}` };
  }
  const year = params.get("year") || DEFAULT_YEAR;
  return {
    fetchUrl: URL_TEMPLATE(year),
    label: year,
    cacheKey: `year:${year}`,
  };
}

interface CacheEntry {
  raw: string;
  fetchedAt: number; // epoch ms
}

function cacheStorageKey(source: Source): string {
  return CACHE_PREFIX + source.cacheKey;
}

function readCache(source: Source): CacheEntry | null {
  try {
    const txt = localStorage.getItem(cacheStorageKey(source));
    if (!txt) return null;
    const entry = JSON.parse(txt) as CacheEntry;
    if (typeof entry.raw !== "string" || typeof entry.fetchedAt !== "number") {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeCache(source: Source, raw: string, fetchedAt: number): void {
  try {
    localStorage.setItem(
      cacheStorageKey(source),
      JSON.stringify({ raw, fetchedAt } satisfies CacheEntry),
    );
  } catch {
    // best-effort (quota / disabled storage)
  }
}

/** Age of the cached entry in ms, or null if nothing cached. */
export function cacheAgeMs(source: Source): number | null {
  const entry = readCache(source);
  if (!entry) return null;
  return Date.now() - entry.fetchedAt;
}

/** True if there's no cache, or the cache is older than the TTL. */
export function isStale(source: Source, ttl = CACHE_TTL_MS): boolean {
  const age = cacheAgeMs(source);
  return age === null || age >= ttl;
}

/**
 * Load tournament data. Uses cache when younger than the TTL unless `force`.
 * `force` (the 'r' refresh) always bypasses the cache.
 */
export async function loadData(
  source: Source,
  force = false,
  ttl = CACHE_TTL_MS,
): Promise<LoadResult> {
  if (!force) {
    const entry = readCache(source);
    if (entry && Date.now() - entry.fetchedAt < ttl) {
      return {
        data: JSON.parse(entry.raw) as WorldCupData,
        fetchedAt: new Date(entry.fetchedAt),
        fromCache: true,
      };
    }
  }

  const resp = await fetch(source.fetchUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${source.fetchUrl}`);
  }
  const raw = await resp.text();
  const data = JSON.parse(raw) as WorldCupData;
  const now = Date.now();
  writeCache(source, raw, now);
  return { data, fetchedAt: new Date(now), fromCache: false };
}

// -- favourite persistence -------------------------------------------------- //
export function loadFavourite(): string | null {
  try {
    return localStorage.getItem(FAVOURITE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveFavourite(team: string | null): void {
  try {
    if (team) localStorage.setItem(FAVOURITE_KEY, team);
    else localStorage.removeItem(FAVOURITE_KEY);
  } catch {
    // best-effort
  }
}
