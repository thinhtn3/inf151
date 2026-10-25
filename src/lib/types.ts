export type Verdict = "take" | "caveats" | "skip";

export type Source = { label: string; url: string };

export type Row = {
  code: string;
  title: string;
  units: string;
  instructor: string;
  rating: string;
  gpa: string;
  seats: "Open" | "Full";
  verdict: Verdict;
  takeIf: string[]; // "Take this course if…" reasons
  avoidIf: string[]; // "Avoid this course if…" reasons
  summary: string; // short overall call
  warning: string;
  evidence: 0 | 1 | 2 | 3;
  sources: Source[]; // where the facts for this course came from
};

export type Result = {
  term: { label: string };
  rows: Row[]; // already ranked, best first
  notOffered: string[];
  noData: string[]; // codes we couldn't find data for
};

export type Term = { year: string; quarter: string; label: string };

// A course saved to a quarter's plan (the course only; no section or professor).
export type PlanItem = { code: string; title: string; units: string };
