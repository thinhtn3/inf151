import { CODE, parseCourse, type CourseRef } from "./courses";

// Parses text copied from a UCI Degree Works worksheet (Cmd/Ctrl+A, Cmd/Ctrl+C). Runs in the browser only.
// The check-mark icons don't survive copy/paste, but the row text still tells the cases apart:
//   completed:    "MATH 2A  CALCULUS  A-  4  2021 WINTER"              (letter grade, plain units, term)
//   in progress:  "IN4MATX 151  PROJECT MANAGEMENT  IP  (4)  2026 FALL" (grade IP, units in parentheses)
//   still needed: "Still needed:  1 Class in IN4MATX 191A" or "Still needed: Select four ... courses" (free text)

export type NeededItem = { count: number; options: CourseRef[] }; // options = "pick any one of these"
export type DegreeWorksResult = {
  needed: NeededItem[];
  inProgress: CourseRef[];
  completedCount: number;
  needsInput: string[]; // "Still needed" requirements that name no specific course (electives, GE, ...)
};

const TERM = /\b20\d\d\s*(FALL|WINTER|SPRING|SSI|SSII|SS10|SUMMER)\b/i;
function codesIn(text: string): CourseRef[] {
  const out: CourseRef[] = [];
  for (const m of text.matchAll(CODE)) {
    const ref = parseCourse(`${m[1]} ${m[2]}`);
    if (ref && !out.some((o) => o.label === ref.label)) out.push(ref);
  }
  return out;
}

export function parseDegreeWorks(raw: string): DegreeWorksResult {
  // Keep each line whole (tab-separated cells become one row); some browsers put every cell on its own line,
  // so rows are also rebuilt from the lines that precede a term ("2026 FALL").
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, "  ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const needed: NeededItem[] = [];
  const inProgress: CourseRef[] = [];
  const needsInput: string[] = [];
  const done = new Set<string>();
  let row: string[] = []; // lines since the last row boundary

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/still needed/i.test(line)) {
      let text = line.replace(/^.*?still needed:?/i, "").trim();
      if (!text) {
        // requirement text is on the following line(s)
        const next = lines[i + 1] ?? "";
        if (/^\d+ class/i.test(next)) {
          text = next;
          i += 1;
        } else {
          while (i + 1 < lines.length && text.length < 500 && lines[i + 1].length > 20 && !TERM.test(lines[i + 1]) && !/still needed/i.test(lines[i + 1])) {
            text += (text ? " " : "") + lines[++i];
          }
        }
      }
      row = [];
      const m = text.match(/(\d+)\s+class(?:es)?\s+in\s+(.+)/i);
      const options = m ? codesIn(m[2]) : [];
      if (m && options.length) {
        const key = options.map((o) => o.label).join("|");
        if (!needed.some((n) => n.options.map((o) => o.label).join("|") === key)) needed.push({ count: Number(m[1]), options });
      } else if (text) needsInput.push(text.slice(0, 300));
      continue;
    }

    row.push(line);
    if (row.length > 8) row.shift();

    if (TERM.test(line)) {
      const text = row.join("  ");
      row = [];
      const ref = codesIn(text.replace(new RegExp(TERM, "gi"), ""))[0];
      if (!ref) continue;
      const isIP = /\bIP\b/.test(text) || /\(\s*\d+(\.\d+)?\s*\)/.test(text);
      if (isIP) {
        if (!inProgress.some((c) => c.label === ref.label)) inProgress.push(ref);
      } else done.add(ref.label);
    }
  }

  // Don't ask for something that is already in progress or done.
  const filtered = needed.filter((n) => !n.options.some((o) => done.has(o.label) || inProgress.some((c) => c.label === o.label)));
  return { needed: filtered, inProgress, completedCount: done.size, needsInput: [...new Set(needsInput)] };
}
