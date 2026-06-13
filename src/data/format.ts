// Pure formatting / parsing helpers (port of fifawc.py module-level functions).
// Timezone: the browser's local timezone is used automatically by JS Date
// local getters, replacing Python's LOCAL_TZ.

import type { Goal, Match } from "./types.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// "HH:MM UTC±N" or "HH:MM UTC±N:MM"
const TIME_RE = /(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})(?::(\d{2}))?/;

/** Combine a match date and 'HH:MM UTC±N' time into an absolute instant. */
export function parseKickoff(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
): Date | null {
  if (!dateStr || !timeStr) return null;
  const m = TIME_RE.exec(timeStr);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const offH = parseInt(m[3], 10);
  let offM = m[4] ? parseInt(m[4], 10) : 0;
  offM = offH >= 0 ? offM : -offM;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if ([y, mo, d].some((n) => Number.isNaN(n))) return null;
  // local-at-venue = UTC + offset  =>  UTC = local - offset
  const offsetMs = (offH * 60 + offM) * 60000;
  const utcMs = Date.UTC(y, mo - 1, d, hour, minute) - offsetMs;
  const dt = new Date(utcMs);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Chronological comparator for matches by actual kickoff instant. */
export function compareMatches(a: Match, b: Match): number {
  const ka = parseKickoff(a.date, a.time);
  const kb = parseKickoff(b.date, b.time);
  if (ka && kb) return ka.getTime() - kb.getTime();
  if (ka && !kb) return -1; // parsed sort before unparsed
  if (!ka && kb) return 1;
  // both unparsed: fall back to scheduled date + raw time
  const da = a.date || "";
  const db = b.date || "";
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.time || "";
  const tb = b.time || "";
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

export function sortMatches(matches: Match[]): Match[] {
  return [...matches].sort(compareMatches);
}

/** Local-timezone 'HH:MM' for a match, or the raw time if unparseable. */
export function localTimeStr(
  dateStr: string,
  timeStr: string | null | undefined,
): string {
  const ko = parseKickoff(dateStr, timeStr);
  if (!ko) return timeStr || "-";
  return `${pad2(ko.getHours())}:${pad2(ko.getMinutes())}`;
}

/** Abbreviated weekday for a 'YYYY-MM-DD' date (scheduled, naive). */
export function weekdayStr(dateStr: string): string {
  const parts = (dateStr || "").split("-");
  if (parts.length !== 3) return "";
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if ([y, mo, d].some((n) => Number.isNaN(n))) return "";
  return WEEKDAYS[new Date(y, mo - 1, d).getDay()];
}

/** Full local date+time label, e.g. 'Sun 2026-06-14 14:30 GMT+2'. */
export function localDatetimeStr(
  dateStr: string,
  timeStr: string | null | undefined,
): string {
  const ko = parseKickoff(dateStr, timeStr);
  if (!ko) return `${dateStr} ${timeStr || ""}`.trim();
  const wd = WEEKDAYS[ko.getDay()];
  const date = `${ko.getFullYear()}-${pad2(ko.getMonth() + 1)}-${pad2(ko.getDate())}`;
  const time = `${pad2(ko.getHours())}:${pad2(ko.getMinutes())}`;
  return `${wd} ${date} ${time} ${tzShortName(ko)}`.trim();
}

/** Actual local date 'YYYY-MM-DD' (may differ from scheduled by a day). */
export function localDateStr(
  dateStr: string,
  timeStr: string | null | undefined,
): string {
  const ko = parseKickoff(dateStr, timeStr);
  if (!ko) return dateStr || "-";
  return `${ko.getFullYear()}-${pad2(ko.getMonth() + 1)}-${pad2(ko.getDate())}`;
}

/** Actual local date with weekday, e.g. 'Sun 2026-06-14'. */
export function localWeekdayDateStr(
  dateStr: string,
  timeStr: string | null | undefined,
): string {
  const ko = parseKickoff(dateStr, timeStr);
  if (!ko) {
    return dateStr ? `${weekdayStr(dateStr)} ${dateStr}`.trim() : "-";
  }
  const wd = WEEKDAYS[ko.getDay()];
  return `${wd} ${ko.getFullYear()}-${pad2(ko.getMonth() + 1)}-${pad2(ko.getDate())}`;
}

let _tzFmt: Intl.DateTimeFormat | null = null;
function tzShortName(dt: Date): string {
  try {
    if (!_tzFmt) {
      _tzFmt = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" });
    }
    const part = _tzFmt.formatToParts(dt).find((p) => p.type === "timeZoneName");
    return part ? part.value : "";
  } catch {
    return "";
  }
}

// Placeholder "teams" for not-yet-decided fixtures:
//   group slots  -> "1A", "2L"        (digit + group letter)
//   third-place  -> "3A/B/C/D/F"      (digit + slash-separated letters)
//   knockout refs-> "W73", "L101"     (winner/loser of match number)
const PLACEHOLDER_RE = /^(?:[WL]\d+|\d+[A-Z](?:\/[A-Z])*)$/;

export function isPlaceholderTeam(name: string | null | undefined): boolean {
  if (!name) return false;
  return PLACEHOLDER_RE.test(name.trim());
}

/** Render a single goal: name + minute (+stoppage) with flags. */
export function goalLabel(goal: Goal): string {
  const minute = goal.minute;
  const offset = goal.offset;
  let when = "";
  if (minute !== null && minute !== undefined) {
    when = `${minute}'`;
    if (offset) when = `${minute}+${offset}'`;
  }
  let flags = "";
  if (goal.penalty) flags += " (pen)";
  if (goal.owngoal) flags += " (og)";
  const name = goal.name ?? "?";
  return `${when} ${name}${flags}`.trim();
}

/** '2-1' full-time score, or '-' if not played yet. */
export function matchScoreStr(match: Match): string {
  const ft = match.score?.ft;
  if (Array.isArray(ft) && ft.length === 2) return `${ft[0]}-${ft[1]}`;
  return "-";
}

/** One-line fixture: 'Team1 2-1 Team2' when played, else 'Team1 vs Team2'. */
export function matchFixtureStr(match: Match): string {
  const t1 = match.team1 ?? "?";
  const t2 = match.team2 ?? "?";
  const score = matchScoreStr(match);
  if (score === "-") return `${t1} vs ${t2}`;
  return `${t1} ${score} ${t2}`;
}
