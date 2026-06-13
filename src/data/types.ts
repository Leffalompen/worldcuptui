// Data shapes for openfootball worldcup.json
// See: https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json

export interface Goal {
  name: string;
  minute?: number | null;
  offset?: number | null;
  penalty?: boolean;
  owngoal?: boolean;
}

export interface Score {
  ht?: [number, number] | null;
  ft?: [number, number] | null;
}

export interface Match {
  round?: string | null;
  date: string; // "YYYY-MM-DD"
  time?: string | null; // "HH:MM UTC±N"
  group?: string | null;
  ground?: string | null;
  team1: string;
  team2: string;
  score?: Score | null;
  goals1?: Goal[] | null;
  goals2?: Goal[] | null;
}

export interface WorldCupData {
  name?: string;
  matches?: Match[];
}

export interface StandingRow {
  team: string;
  P: number;
  W: number;
  D: number;
  L: number;
  GF: number;
  GA: number;
  GD: number;
  Pts: number;
}

export interface ScorerRow {
  name: string;
  team: string;
  goals: number;
  pens: number;
}

export interface LoadResult {
  data: WorldCupData;
  fetchedAt: Date;
  fromCache: boolean;
}
