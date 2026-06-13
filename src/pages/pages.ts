// Pages: factory of Page objects bound to a loaded WorldCup
// (port of fifawc.py Pages class).

import type { Match } from "../data/types.ts";
import { WorldCup } from "../data/worldcup.ts";
import {
  goalLabel,
  localDateStr,
  localDatetimeStr,
  localTimeStr,
  localWeekdayDateStr,
  matchFixtureStr,
  matchScoreStr,
  sortMatches,
  weekdayStr,
} from "../data/format.ts";
import type { Page, Row } from "./page.ts";

export class Pages {
  readonly wc: WorldCup;
  favourite: string | null;

  constructor(wc: WorldCup, favourite: string | null = null) {
    this.wc = wc;
    this.favourite = favourite;
  }

  // -- main menu ----------------------------------------------------------- //
  mainMenu(): Page {
    const wc = this.wc;
    const items: Array<[string, string, () => Page]> = [];

    if (this.favourite) {
      const fav = this.favourite;
      const group = wc.groupForTeam(fav);
      if (group) {
        items.push([
          `⭐ ${fav}'s Group (${group})`,
          `Group ${group} standings & fixtures`,
          () => this.groupDetail(group),
        ]);
      }
      items.push([
        `⭐ ${fav}'s Matches`,
        "All matches (past & future)",
        () => this.countryDetail(fav),
      ]);
      items.push([
        `⭐ ${fav}'s Stats`,
        "Match details & goal scorers",
        () => this.favouriteStats(fav),
      ]);
    }

    items.push(
      ["Groups", `${wc.groups().length} groups`, () => this.groups()],
      ["Match Dates", `${wc.dates().length} days`, () => this.dates()],
      ["Countries", `${wc.countries().length} teams`, () => this.countries()],
      ["Top Scorers", this.scorerNote(), () => this.topScorers()],
      ["Stadiums", `${wc.grounds().length} venues`, () => this.stadiums()],
      ["Rounds", `${wc.rounds().length} rounds`, () => this.rounds()],
      ["All Matches", `${wc.matches.length} matches`, () => this.allMatches()],
    );

    const rows: Row[] = items.map(([label, hint, builder]) => ({
      cells: [label, hint],
      key: builder,
    }));
    const favNote = this.favourite
      ? `Favourite: ⭐ ${this.favourite}`
      : "No favourite set — press f on any country";

    return {
      title: "Main Menu",
      columns: ["Section", "Info"],
      rows,
      onSelect: (key) => (key as () => Page)(),
      note: favNote,
      detail: this.upcomingMatchesLines(),
    };
  }

  private scorerNote(): string {
    return this.wc.hasScores ? "available" : "no data yet";
  }

  private upcomingMatchesLines(): string[] {
    const today = isoLocalDate(new Date());
    const upcoming = sortMatches(
      this.wc.matches.filter((m) => matchScoreStr(m) === "-"),
    );
    if (upcoming.length === 0) return [];

    // Find up to the next 2 distinct local dates (matchday 1 can be today).
    const seenDates: string[] = [];
    for (const m of upcoming) {
      const localD = localDateStr(m.date, m.time);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(localD)) continue;
      if (localD < today) continue;
      if (!seenDates.includes(localD)) seenDates.push(localD);
      if (seenDates.length === 2) break;
    }
    if (seenDates.length === 0) return [];

    const lines: string[] = ["[b]Upcoming Matches[/b]"];
    for (const localD of seenDates) {
      const dayLabel =
        localD === today ? "Today" : `${weekdayStr(localD)} ${localD}`;
      lines.push(`  [bold]${dayLabel}[/bold]`);
      const dayMatches = upcoming.filter(
        (m) => localDateStr(m.date, m.time) === localD,
      );
      for (const m of dayMatches) {
        const time = localTimeStr(m.date, m.time);
        const fixture = `${m.team1 ?? "?"} vs ${m.team2 ?? "?"}`;
        const group = m.group || m.round || "";
        const groupTag = group ? `  [${group}]` : "";
        lines.push(`    ${time}  ${fixture}${groupTag}`);
      }
    }
    return lines;
  }

  // -- groups -------------------------------------------------------------- //
  groups(): Page {
    const rows: Row[] = this.wc.groups().map((g) => ({
      cells: [g, this.wc.teamsInGroup(g).join(", ")],
      key: g,
    }));
    return {
      title: "Groups",
      columns: ["Group", "Teams"],
      rows,
      onSelect: (key) => this.groupDetail(key as string),
    };
  }

  private standingsLines(group: string): string[] {
    const wc = this.wc;
    const lines = [`[b]${group} — Standings[/b]`];
    lines.push(
      pad("Team", 22) +
        padLeft("P", 3) +
        padLeft("W", 3) +
        padLeft("D", 3) +
        padLeft("L", 3) +
        padLeft("GF", 4) +
        padLeft("GA", 4) +
        padLeft("GD", 4) +
        padLeft("Pts", 5),
    );
    for (const r of wc.standings(group)) {
      lines.push(
        pad(r.team, 22) +
          padLeft(String(r.P), 3) +
          padLeft(String(r.W), 3) +
          padLeft(String(r.D), 3) +
          padLeft(String(r.L), 3) +
          padLeft(String(r.GF), 4) +
          padLeft(String(r.GA), 4) +
          padLeft(String(r.GD), 4) +
          padLeft(String(r.Pts), 5),
      );
    }
    if (!wc.hasScores) {
      lines.push("[dim](no results yet — ordered by name)[/dim]");
    }
    return lines;
  }

  groupDetail(group: string): Page {
    const matches = sortMatches(this.wc.matchesForGroup(group));
    return {
      title: group,
      columns: ["Date (local)", "Time", "Match", "Score", "Ground"],
      rows: this.matchRows(matches),
      onSelect: (key) => this.matchDetail(key as Match),
      detail: this.standingsLines(group),
    };
  }

  // -- dates --------------------------------------------------------------- //
  dates(): Page {
    const rows: Row[] = this.wc.dates().map((d) => {
      const ms = sortMatches(this.wc.matchesForDate(d));
      const label = `${weekdayStr(d)} ${d}`.trim();
      const summary = ms.map((m) => matchFixtureStr(m)).join(" · ");
      return { cells: [label, summary], key: d };
    });
    return {
      title: "Match Dates",
      columns: ["Date", "Matches"],
      rows,
      onSelect: (key) => this.dateDetail(key as string),
    };
  }

  dateDetail(date: string): Page {
    const matches = sortMatches(this.wc.matchesForDate(date));
    const rows: Row[] = matches.map((m) => ({
      cells: [
        localWeekdayDateStr(m.date, m.time),
        localTimeStr(m.date, m.time),
        `${m.team1 ?? "?"} vs ${m.team2 ?? "?"}`,
        matchScoreStr(m),
        m.group ?? "-",
        m.ground ?? "-",
      ],
      key: m,
    }));
    return {
      title: `Matches on ${weekdayStr(date)} ${date}`.trimEnd(),
      columns: ["Date (local)", "Time", "Match", "Score", "Group", "Ground"],
      rows,
      onSelect: (key) => this.matchDetail(key as Match),
    };
  }

  // -- countries ----------------------------------------------------------- //
  countries(): Page {
    const rows: Row[] = this.wc.countries().map((t) => ({
      cells: [t, `${this.wc.matchesForTeam(t).length} matches`],
      key: t,
    }));
    const fav = this.favourite;
    const note = fav
      ? `⭐ Favourite: ${fav}  •  f to change/clear`
      : "f to set a favourite country";
    return {
      title: "Countries",
      columns: ["Team", "Matches"],
      rows,
      onSelect: (key) => this.countryDetail(key as string),
      note,
    };
  }

  countryDetail(team: string): Page {
    const matches = sortMatches(this.wc.matchesForTeam(team));
    const scorers = this.wc.topScorersForTeam(team, 3);
    const detail: string[] = [];
    if (scorers.length) {
      detail.push("[b]Top scorers[/b]");
      for (const s of scorers) {
        const pens = s.pens ? ` (${s.pens} pen)` : "";
        detail.push(`  ${s.name} — ${s.goals}${pens}`);
      }
    }
    const group = this.wc.groupForTeam(team);
    let detailBelow: string[] = [];
    let related: Page["related"];
    const isFav = this.favourite === team;
    const favHint = isFav ? "f to clear favourite" : "f to set as favourite";
    let note = "";
    if (group) {
      detailBelow = this.standingsLines(group);
      related = { label: `Open ${group}`, build: () => this.groupDetail(group) };
      if (isFav) {
        note = `⭐ Favourite  •  ${group} — G to open group  •  f to clear favourite`;
      } else {
        note = `${group} — G to open group  •  ${favHint}`;
      }
    } else {
      note = isFav ? "⭐ Favourite  •  f to clear favourite" : favHint;
    }
    return {
      title: `${isFav ? "⭐ " : ""}${team}`,
      columns: ["Date (local)", "Time", "Match", "Score", "Round"],
      rows: this.matchRows(matches, true),
      onSelect: (key) => this.matchDetail(key as Match),
      detail,
      note,
      detailBelow,
      related,
      favTeam: team,
    };
  }

  // -- top scorers --------------------------------------------------------- //
  topScorers(): Page {
    const scorers = this.wc.topScorers();
    if (scorers.length === 0) {
      return {
        title: "Top Scorers",
        columns: ["Info"],
        rows: [],
        detail: ["[dim]No goal data available for this tournament yet.[/dim]"],
      };
    }
    const rows: Row[] = scorers.map((s) => {
      const pens = s.pens ? ` (${s.pens} pen)` : "";
      return { cells: [`${s.goals}${pens}`, s.name, s.team], key: s.name };
    });
    return {
      title: "Top Scorers",
      columns: ["Goals", "Player", "Team"],
      rows,
      onSelect: (key) => this.scorerDetail(key as string),
    };
  }

  scorerDetail(name: string): Page {
    const lines: string[] = [`[b]Goals by ${name}[/b]`];
    const rows: Row[] = [];
    for (const m of this.wc.matches) {
      const scored: string[] = [];
      for (const goals of [m.goals1 ?? [], m.goals2 ?? []]) {
        for (const g of goals) {
          if (g.name === name && !g.owngoal) scored.push(goalLabel(g));
        }
      }
      if (scored.length) {
        const fixture = `${m.team1 ?? "?"} vs ${m.team2 ?? "?"}`;
        lines.push(
          `• ${m.date ?? "?"}  ${fixture} [${matchScoreStr(m)}] — ${scored.join(", ")}`,
        );
        rows.push({
          cells: [
            localTimeStr(m.date, m.time),
            fixture,
            matchScoreStr(m),
            scored.join(", "),
          ],
          key: m,
        });
      }
    }
    return {
      title: name,
      columns: ["Time", "Match", "Score", "Goals"],
      rows,
      onSelect: (key) => this.matchDetail(key as Match),
      detail: lines,
    };
  }

  // -- stadiums ------------------------------------------------------------ //
  stadiums(): Page {
    const rows: Row[] = this.wc.grounds().map((g) => ({
      cells: [g, `${this.wc.matchesForGround(g).length} matches`],
      key: g,
    }));
    return {
      title: "Stadiums",
      columns: ["Ground", "Matches"],
      rows,
      onSelect: (key) => this.stadiumDetail(key as string),
    };
  }

  stadiumDetail(ground: string): Page {
    const matches = sortMatches(this.wc.matchesForGround(ground));
    return {
      title: ground,
      columns: ["Date (local)", "Time", "Match", "Score", "Round"],
      rows: this.matchRows(matches, true),
      onSelect: (key) => this.matchDetail(key as Match),
    };
  }

  // -- rounds -------------------------------------------------------------- //
  rounds(): Page {
    const rows: Row[] = this.wc.rounds().map((r) => ({
      cells: [r, `${this.wc.matchesForRound(r).length} matches`],
      key: r,
    }));
    return {
      title: "Rounds",
      columns: ["Round", "Matches"],
      rows,
      onSelect: (key) => this.roundDetail(key as string),
    };
  }

  roundDetail(rnd: string): Page {
    const matches = sortMatches(this.wc.matchesForRound(rnd));
    return {
      title: rnd,
      columns: ["Date (local)", "Time", "Match", "Score", "Ground"],
      rows: this.matchRows(matches),
      onSelect: (key) => this.matchDetail(key as Match),
    };
  }

  // -- all matches --------------------------------------------------------- //
  allMatches(): Page {
    const matches = sortMatches(this.wc.matches);
    return {
      title: "All Matches",
      columns: ["Date (local)", "Time", "Match", "Score", "Round"],
      rows: this.matchRows(matches, true),
      onSelect: (key) => this.matchDetail(key as Match),
    };
  }

  // -- match detail -------------------------------------------------------- //
  matchDetail(match: Match): Page {
    const t1 = match.team1 ?? "?";
    const t2 = match.team2 ?? "?";
    const score = matchScoreStr(match);
    const ht = match.score?.ht;
    const lines: string[] = [
      `[b]${t1}  ${score}  ${t2}[/b]`,
      "",
      `Round:   ${match.round ?? "-"}`,
      `Group:   ${match.group ?? "-"}`,
      `When:    ${localDatetimeStr(match.date, match.time)}`,
      `Kickoff: ${match.time ?? "-"} (original)`,
      `Ground:  ${match.ground ?? "-"}`,
    ];
    if (Array.isArray(ht) && ht.length === 2) {
      lines.push(`Half-time: ${ht[0]}-${ht[1]}`);
    }
    lines.push("");

    const g1 = match.goals1 ?? [];
    const g2 = match.goals2 ?? [];
    if (g1.length || g2.length) {
      lines.push("[b]Goals[/b]");
      lines.push(`  ${t1}:`);
      for (const g of g1) lines.push(`    ${goalLabel(g)}`);
      if (g1.length === 0) lines.push("    —");
      lines.push(`  ${t2}:`);
      for (const g of g2) lines.push(`    ${goalLabel(g)}`);
      if (g2.length === 0) lines.push("    —");
    } else if (score === "-") {
      lines.push("[dim]Not played yet.[/dim]");
    }

    return {
      title: `${t1} vs ${t2}`,
      columns: ["Detail"],
      rows: [],
      detail: lines,
    };
  }

  // -- favourite stats ----------------------------------------------------- //
  favouriteStats(team: string): Page {
    const matches = sortMatches(this.wc.matchesForTeam(team));
    const rows: Row[] = matches.map((m) => {
      const isTeam1 = m.team1 === team;
      const opponent = (isTeam1 ? m.team2 : m.team1) ?? "?";
      const score = matchScoreStr(m);
      const teamGoals = (isTeam1 ? m.goals1 : m.goals2) ?? [];
      const oppGoals = (isTeam1 ? m.goals2 : m.goals1) ?? [];
      const teamScorers =
        teamGoals.map((g) => goalLabel(g)).join(", ") ||
        (score !== "-" ? "-" : "TBD");
      const oppScorers =
        oppGoals.map((g) => goalLabel(g)).join(", ") ||
        (score !== "-" ? "-" : "TBD");
      return {
        cells: [
          localWeekdayDateStr(m.date, m.time),
          opponent,
          score,
          teamScorers,
          oppScorers,
        ],
        key: m,
      };
    });

    const scorers = this.wc.topScorersForTeam(team);
    const detail: string[] = [`[b]${team} — Match Statistics[/b]`];
    if (scorers.length) {
      const scorerStr = scorers
        .map(
          (s) => `${s.name} ${s.goals}` + (s.pens ? ` (${s.pens} pen)` : ""),
        )
        .join(", ");
      detail.push(`Goal scorers: ${scorerStr}`);
    } else if (matches.some((m) => matchScoreStr(m) !== "-")) {
      detail.push("No goals scored yet.");
    } else {
      detail.push("[dim]No matches played yet.[/dim]");
    }

    const group = this.wc.groupForTeam(team);
    let related: Page["related"];
    if (group) {
      related = { label: `Open ${group}`, build: () => this.groupDetail(group) };
    }

    return {
      title: `⭐ ${team} — Stats`,
      columns: ["Date", "Opponent", "Score", `${team} Goals`, "Opponent Goals"],
      rows,
      onSelect: (key) => this.matchDetail(key as Match),
      detail,
      related,
      favTeam: team,
    };
  }

  // -- helpers ------------------------------------------------------------- //
  private matchRows(matches: Match[], roundCol = false): Row[] {
    return matches.map((m) => {
      const fixture = `${m.team1 ?? "?"} vs ${m.team2 ?? "?"}`;
      const last = roundCol ? m.round ?? "-" : m.ground ?? "-";
      return {
        cells: [
          localWeekdayDateStr(m.date, m.time),
          localTimeStr(m.date, m.time),
          fixture,
          matchScoreStr(m),
          last,
        ],
        key: m,
      };
    });
  }
}

// -- small string helpers (mirror Python f-string padding) ----------------- //
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}
function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? "0" + m : m}-${day < 10 ? "0" + day : day}`;
}
