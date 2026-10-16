export type Verdict = "take" | "caveats" | "skip";

export type Row = {
  code: string;
  title: string;
  instructor: string;
  rating: string;
  gpa: string;
  seats: "Open" | "Full";
  verdict: Verdict;
  summary: string;
  warning: string;
  evidence: 0 | 1 | 2 | 3;
};

export type Result = {
  term: { label: string };
  rows: Row[]; // already ranked, best first
  notOffered: string[];
  noData: string[]; // codes we couldn't find data for
};

export type Term = { year: string; quarter: string; label: string };
