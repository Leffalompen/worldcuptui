// WorldCup: loaded tournament with derived queries (port of fifawc.py WorldCup).

import type { Match, ScorerRow, StandingRow } from "./types.ts";
import {
  compareMatches,
  isPlaceholderTeam,
  matchScoreStr,
} from "./format.ts";

export class WorldCup {
  readonly name: string;
  readonly matches: Match[];

  constructor(name: string, matches: Match[]) {
    this.name = name;
    this.matches = matches;
  }

  get hasScores(): boolean {
    return this.matches.some((m) => m.score?.ft);
  }

  groups(): string[] {
    const set = new Set<string>();
    for (const m of this.matches) if (m.group) set.add(m.group);
    return [...set].sort();
  }

  dates(): string[] {
    const set = new Set<string>();
    for (const m of this.matches) if (m.date) set.add(m.date);
    return [...set].sort();
  }

  rounds(): string[] {
    // Order rounds by the earliest match in each.
    const earliest = new Map<string, Match>();
    for (const m of this.matches) {
      const r = m.round;
      if (!r) continue;
      const cur = earliest.get(r);
      if (!cur || compareMatches(m, cur) < 0) earliest.set(r, m);
    }
    return [...earliest.keys()].sort((a, b) =>
      compareMatches(earliest.get(a)!, earliest.get(b)!),
    );
  }

  grounds(): string[] {
    const set = new Set<string>();
    for (const m of this.matches) if (m.ground) set.add(m.ground);
    return [...set].sort();
  }

  countries(): string[] {
    const set = new Set<string>();
    for (const m of this.matches) {
      if (m.team1) set.add(m.team1);
      if (m.team2) set.add(m.team2);
    }
    // Real countries first (alphabetical), placeholders at the bottom.
    return [...set].sort((a, b) => {
      const pa = isPlaceholderTeam(a) ? 1 : 0;
      const pb = isPlaceholderTeam(b) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
  }

  groupForTeam(team: string): string | null {
    for (const m of this.matchesForTeam(team)) {
      if (m.group) return m.group;
    }
    return null;
  }

  matchesForGroup(group: string): Match[] {
    return this.matches.filter((m) => m.group === group);
  }

  teamsInGroup(group: string): string[] {
    const set = new Set<string>();
    for (const m of this.matchesForGroup(group)) {
      for (const t of [m.team1, m.team2]) {
        if (t && !isPlaceholderTeam(t)) set.add(t);
      }
    }
    return [...set].sort();
  }

  matchesForDate(date: string): Match[] {
    return this.matches.filter((m) => m.date === date);
  }

  matchesForRound(rnd: string): Match[] {
    return this.matches.filter((m) => m.round === rnd);
  }

  matchesForGround(ground: string): Match[] {
    return this.matches.filter((m) => m.ground === ground);
  }

  matchesForTeam(team: string): Match[] {
    return this.matches.filter((m) => m.team1 === team || m.team2 === team);
  }

  standings(group: string): StandingRow[] {
    const table = new Map<string, StandingRow>();
    const row = (team: string): StandingRow => {
      let r = table.get(team);
      if (!r) {
        r = { team, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
        table.set(team, r);
      }
      return r;
    };

    for (const m of this.matchesForGroup(group)) {
      const t1 = m.team1;
      const t2 = m.team2;
      if (!t1 || !t2) continue;
      const r1 = row(t1);
      const r2 = row(t2);
      const ft = m.score?.ft;
      if (!(Array.isArray(ft) && ft.length === 2)) continue;
      const [g1, g2] = ft;
      r1.P += 1;
      r1.GF += g1;
      r1.GA += g2;
      r2.P += 1;
      r2.GF += g2;
      r2.GA += g1;
      if (g1 > g2) {
        r1.W += 1;
        r1.Pts += 3;
        r2.L += 1;
      } else if (g2 > g1) {
        r2.W += 1;
        r2.Pts += 3;
        r1.L += 1;
      } else {
        r1.D += 1;
        r2.D += 1;
        r1.Pts += 1;
        r2.Pts += 1;
      }
    }

    const rows = [...table.values()];
    for (const r of rows) r.GD = r.GF - r.GA;
    const played = this.matchesForGroup(group).some((m) => m.score?.ft);
    if (played) {
      rows.sort(
        (a, b) =>
          b.Pts - a.Pts ||
          b.GD - a.GD ||
          b.GF - a.GF ||
          (a.team.toLowerCase() < b.team.toLowerCase() ? -1 : 1),
      );
    } else {
      rows.sort((a, b) =>
        a.team.toLowerCase() < b.team.toLowerCase() ? -1 : 1,
      );
    }
    return rows;
  }

  topScorers(): ScorerRow[] {
    const tally = new Map<string, ScorerRow>();
    for (const m of this.matches) {
      const sides: [Match["goals1"], string][] = [
        [m.goals1 ?? [], m.team1],
        [m.goals2 ?? [], m.team2],
      ];
      for (const [goals, team] of sides) {
        for (const g of goals ?? []) {
          if (g.owngoal) continue;
          const name = g.name ?? "?";
          const key = `${name}\u0000${team ?? ""}`;
          let entry = tally.get(key);
          if (!entry) {
            entry = { name, team: team ?? "?", goals: 0, pens: 0 };
            tally.set(key, entry);
          }
          entry.goals += 1;
          if (g.penalty) entry.pens += 1;
        }
      }
    }
    const rows = [...tally.values()];
    rows.sort(
      (a, b) =>
        b.goals - a.goals ||
        (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1),
    );
    return rows;
  }

  topScorersForTeam(team: string, limit = 3): ScorerRow[] {
    const tally = new Map<string, ScorerRow>();
    for (const m of this.matches) {
      let goals: Match["goals1"] = [];
      if (m.team1 === team) goals = m.goals1 ?? [];
      else if (m.team2 === team) goals = m.goals2 ?? [];
      for (const g of goals ?? []) {
        if (g.owngoal) continue;
        const name = g.name ?? "?";
        let entry = tally.get(name);
        if (!entry) {
          entry = { name, team, goals: 0, pens: 0 };
          tally.set(name, entry);
        }
        entry.goals += 1;
        if (g.penalty) entry.pens += 1;
      }
    }
    const rows = [...tally.values()];
    rows.sort(
      (a, b) =>
        b.goals - a.goals ||
        (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1),
    );
    return rows.slice(0, limit);
  }
}

export { matchScoreStr };
