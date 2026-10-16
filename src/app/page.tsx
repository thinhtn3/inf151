"use client";

import { useEffect, useState } from "react";
import { DegreeWorksDialog } from "@/components/degreeworks-dialog";
import { extractCourses } from "@/lib/courses";
import { parsePriorities } from "@/lib/priorities";
import type { Result, Row, Term, Verdict } from "@/lib/types";

const MAX_COURSES = 60;

// Click-to-add suggestions for the "What matters" field.
const SUGGESTIONS = [
  { label: "Clear lecturer, avoid full", text: "A clear lecturer, and nothing that is full." },
  { label: "Light workload, high GPA", text: "Light workload and a high average GPA." },
  { label: "Already taking three hard", text: "I'm already taking three hard classes." },
];

const VERDICT: Record<Verdict, { label: string; fg: string; bg: string }> = {
  take: { label: "Take it", fg: "text-take-fg", bg: "bg-take-bg" },
  caveats: { label: "Take with caveats", fg: "text-caveat-fg", bg: "bg-caveat-bg" },
  skip: { label: "Skip / delay", fg: "text-skip-fg", bg: "bg-skip-bg" },
};

const EVIDENCE_LABEL = ["No evidence", "Limited evidence", "Some evidence", "Strong evidence"];

const COLS = "grid grid-cols-[36px_minmax(0,2fr)_minmax(0,1.2fr)_90px_80px_120px_150px_20px] gap-x-3";

export default function Home() {
  const [term, setTerm] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [courseText, setCourseText] = useState("");
  const [prefText, setPrefText] = useState("");
  const [inProgress, setInProgress] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [understood, setUnderstood] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    fetch("/api/recommend")
      .then((r) => r.json())
      .then((b: { terms?: Term[] }) => {
        const list = b.terms ?? [];
        setTerms(list);
        if (list[0]) setTerm(`${list[0].year}|${list[0].quarter}`);
      })
      .catch(() => {});
  }, []);

  const termLabel = terms.find((t) => `${t.year}|${t.quarter}` === term)?.label ?? "this term";
  const empty = status === "idle" && !result && !error;
  // A suggestion disappears once its text is in the field, and comes back if that text is deleted.
  const remaining = SUGGESTIONS.filter((e) => !prefText.includes(e.text));

  async function rank(input?: { courseText: string; prefText: string; inProgress?: string[] }) {
    const cText = input?.courseText ?? courseText;
    const pText = input?.prefText ?? prefText;
    const taking = input?.inProgress ?? inProgress;
    if (status === "loading") return;

    const { courses, rest } = extractCourses(`${cText}. ${pText}`);
    setUnderstood(parsePriorities(`${cText} ${pText}`));
    setOpen(null);
    setError(null);
    if (!courses.length) {
      setResult(null);
      setStatus("done");
      setError("Add at least one course code, like ICS 33 or COMPSCI 161.");
      return;
    }
    if (courses.length > MAX_COURSES) {
      setStatus("done");
      setError(`That's ${courses.length} courses. You can compare up to ${MAX_COURSES} at a time.`);
      return;
    }

    setStatus("loading");
    try {
      const [year, quarter] = term.split("|");
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courses: courses.map((c) => c.label),
          preferences: rest,
          currentlyTaking: taking,
          ...(term && { term: { year, quarter } }),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(body.error ?? "Something went wrong. Try again.");
      } else {
        setResult(body as Result);
        setOpen(null);
      }
    } catch {
      setResult(null);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setStatus("done");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void rank();
    }
  };

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b border-line px-8 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[17px] font-semibold text-accent">Course Recommender</span>
          <span className="text-sm text-fg-muted">UC Irvine</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1040px] px-8 pb-16">
        {/* Command bar */}
        <div className={`sticky top-0 z-[2] flex flex-col gap-5 bg-page ${empty ? "pb-6 pt-[72px]" : "pb-2 pt-5"}`}>
          {empty && <h1 className="m-0 max-w-[24ch] text-balance text-[30px] font-medium tracking-[-0.01em]">Rank the courses you&apos;re deciding between.</h1>}

          <div className="flex flex-wrap gap-px overflow-hidden rounded-[14px] border border-line-bar bg-line-bar">
            <label className="bar-cell flex flex-[0_0_150px] flex-col gap-0.5 bg-panel px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-[0.05em] text-fg-label">Term</span>
              <select value={term} onChange={(e) => setTerm(e.target.value)} className="cursor-pointer border-0 bg-transparent p-0 text-inherit outline-none">
                {terms.map((t) => (
                  <option key={t.label} value={`${t.year}|${t.quarter}`} className="text-black">
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="bar-cell flex flex-[1_1_260px] flex-col gap-0.5 bg-panel px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-[0.05em] text-fg-label">Courses</span>
              <input
                value={courseText}
                onChange={(e) => setCourseText(e.target.value)}
                onKeyDown={onEnter}
                placeholder="ICS 33, COMPSCI 161"
                className="border-0 bg-transparent p-0 text-inherit outline-none"
              />
            </label>
            <label className="bar-cell flex flex-[1_1_260px] flex-col gap-0.5 bg-panel px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-[0.05em] text-fg-label">What matters</span>
              <input
                value={prefText}
                onChange={(e) => setPrefText(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Light workload, already taking two hard classes"
                className="border-0 bg-transparent p-0 text-inherit outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void rank()}
              disabled={status === "loading"}
              className="min-h-14 flex-none cursor-pointer border-0 bg-accent px-[26px] text-[15px] font-medium text-on-accent disabled:cursor-default disabled:bg-accent-disabled"
            >
              {status === "loading" ? "Ranking…" : "Rank"}
            </button>
          </div>

          {empty && (
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="cursor-pointer rounded-[10px] border border-btn2-border bg-btn2-bg px-[18px] py-2.5 text-[15px] font-medium text-fg hover:bg-[var(--btn-secondary-bg-hover)]"
              >
                Import from DegreeWorks
              </button>
              {remaining.length > 0 && <span className="text-sm text-fg-muted">Add</span>}
              {remaining.map((e) => (
                <button
                  key={e.label}
                  type="button"
                  onClick={() => setPrefText((t) => (t.trim() ? `${t.trim()} ${e.text}` : e.text))}
                  className="cursor-pointer rounded-full border border-dashed border-line-btn bg-transparent px-3 py-[5px] text-[13px] text-fg-3 hover:border-accent"
                >
                  + {e.label}
                </button>
              ))}
            </div>
          )}
          {empty && inProgress.length > 0 && (
            <p className="m-0 text-sm text-fg-muted">
              From DegreeWorks: taking {inProgress.join(", ")} now. We use that to judge your workload.{" "}
              <button type="button" onClick={() => setInProgress([])} className="cursor-pointer border-0 bg-transparent p-0 text-fg-muted underline">
                Clear
              </button>
            </p>
          )}
        </div>

        {/* Results */}
        {status === "loading" && <p className="pt-6 text-fg-muted">Checking who&apos;s teaching {termLabel} and what students say about them…</p>}

        {status !== "loading" && error && (
          <p role="alert" className="mt-4 rounded-xl border border-line-quiet px-[18px] py-3.5 text-sm text-skip-fg">
            {error}
          </p>
        )}

        {status !== "loading" && result && (
          <div className="flex flex-col gap-4 pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="m-0 text-[22px] font-medium">
                {result.rows.length ? `${result.rows.length} ranked for ${result.term.label}` : `Nothing to rank for ${result.term.label}`}
              </h2>
              {understood.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] text-fg-label">Understood</span>
                  {understood.map((c) => (
                    <span key={c} className="rounded-full bg-chip-pref px-2.5 py-[3px] text-[13px] text-chip-pref-fg">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {result.rows.length > 0 && (
              <div className="overflow-x-auto rounded-[14px] border border-line">
                <div className="min-w-[760px]">
                  <div className={`${COLS} bg-table-head px-5 py-2.5 text-xs uppercase tracking-[0.05em] text-fg-label`}>
                    <span>#</span>
                    <span>Course</span>
                    <span>Instructor</span>
                    <span>Ratings</span>
                    <span>GPA</span>
                    <span>Seats</span>
                    <span>Verdict</span>
                    <span />
                  </div>
                  {result.rows.map((r, i) => (
                    <TableRow key={r.code} row={r} rank={i + 1} open={open === r.code} onToggle={() => setOpen(open === r.code ? null : r.code)} />
                  ))}
                </div>
              </div>
            )}

            {result.notOffered.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-panel px-[18px] py-3.5 text-sm text-fg-3">
                <span className="font-medium text-notoffered">Not offered in {result.term.label}</span>
                <span className="font-code text-[13px] leading-[1.7]">{result.notOffered.join(", ")}</span>
              </div>
            )}
            {result.noData.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-line-quiet px-[18px] py-3.5 text-sm text-fg-muted">
                <span className="font-medium">No {result.term.label} data yet</span>
                <span className="font-code text-[13px]">{result.noData.join(", ")}</span>
              </div>
            )}
          </div>
        )}
      </main>

      <DegreeWorksDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onUse={(codes, taking) => {
          // Fill in Courses only. The student can still add priorities before pressing Rank.
          if (codes.length) setCourseText(codes.join(", "));
          setInProgress(taking);
        }}
      />
    </div>
  );
}

function TableRow({ row, rank, open, onToggle }: { row: Row; rank: number; open: boolean; onToggle: () => void }) {
  const v = VERDICT[row.verdict];
  return (
    <div className={`border-t border-line ${open ? "bg-row-open" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`${COLS} w-full cursor-pointer items-center border-0 bg-transparent px-5 py-3.5 text-left text-sm text-inherit`}
      >
        <span className="font-code text-accent">{rank}</span>
        <span className="min-w-0">
          <span className="font-code text-[13px] font-semibold">{row.code}</span>
          <br />
          <span className="text-fg-3">{row.title}</span>
        </span>
        <span className="min-w-0 break-words text-fg-2">{row.instructor}</span>
        <span>{row.rating}</span>
        <span>{row.gpa}</span>
        <span className={row.seats === "Full" ? "text-seat-full" : "text-take-fg"}>{row.seats}</span>
        <span>
          <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[13px] ${v.fg} ${v.bg}`}>{v.label}</span>
        </span>
        <span aria-hidden className="text-xs text-fg-label">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 pb-[18px] pl-[68px] pr-5">
          <p className="m-0 max-w-[70ch] text-pretty text-fg-2">{row.summary}</p>
          <span className="flex items-center gap-1.5">
            {[0, 1, 2].map((d) => (
              <span key={d} className={`h-2 w-2 rounded-full ${d < row.evidence ? "bg-accent" : "bg-dot-off"}`} />
            ))}
            <span className="text-[13px] text-fg-muted">{EVIDENCE_LABEL[row.evidence]}</span>
          </span>
          {row.warning && <div className="max-w-[70ch] rounded-[10px] bg-warn-bg px-3.5 py-2.5 text-sm text-warn-fg">{row.warning}</div>}
        </div>
      )}
    </div>
  );
}
