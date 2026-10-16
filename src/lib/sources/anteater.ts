import { cached, HOUR } from "../cache";
import { courseId, type CourseRef } from "../courses";

const BASE = "https://anteaterapi.com/v2/rest";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15000) });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.message ?? `Anteater ${res.status}`);
  return body.data as T;
}

// ---------- Terms ----------

export type Term = { year: string; quarter: string; label: string };

export function fetchTerms(): Promise<Term[]> {
  return cached("anteater:terms", HOUR, async () => {
    const rows = await get<{ year: string; quarter: string; longName: string }[]>("/websoc/terms");
    return rows.filter((t) => ["Fall", "Winter", "Spring"].includes(t.quarter)).slice(0, 4).map((t) => ({ year: t.year, quarter: t.quarter, label: `${t.quarter} ${t.year}` }));
  });
}

// ---------- Who is teaching this quarter (WebSoc) ----------

export type OfferedSection = {
  code: string;
  type: string;
  instructors: string[];
  days: string;
  time: string;
  status: string;
  enrolled: number | null;
  capacity: number | null;
  waitlist: number | null;
};

export type Offering = {
  offered: boolean;
  sections: OfferedSection[]; // lectures/seminars/studios only (not labs/discussions)
  instructors: string[]; // distinct primary instructors this quarter, STAFF removed
  hasStaffOnly: boolean;
};

type WebSocSection = {
  sectionCode: string;
  sectionType: string;
  instructors: string[];
  status: string;
  maxCapacity: string;
  numOnWaitlist: string;
  numCurrentlyEnrolled: { totalEnrolled: string };
  meetings: { timeIsTBA: boolean; days?: string; startTime?: { hour: number; minute: number }; endTime?: { hour: number; minute: number } }[];
  isCancelled: boolean;
};

const SECONDARY = new Set(["Lab", "Dis", "Qui", "Quiz", "Tap", "Tut", "Act", "Fld"]);
const num = (v: string | undefined) => (v && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const hhmm = (t?: { hour: number; minute: number }) => (t ? `${t.hour}:${String(t.minute).padStart(2, "0")}` : "");

export function fetchOffering(course: CourseRef, term: Term): Promise<Offering> {
  return cached(`websoc:${term.year}${term.quarter}:${courseId(course)}`, HOUR / 2, async () => {
    const q = `year=${term.year}&quarter=${term.quarter}&department=${encodeURIComponent(course.department)}&courseNumber=${encodeURIComponent(course.number)}`;
    const data = await get<{ schools: { departments: { courses: { courseNumber: string; sections: WebSocSection[] }[] }[] }[] }>(`/websoc?${q}`);
    const courses = data.schools.flatMap((s) => s.departments.flatMap((d) => d.courses)).filter((c) => c.courseNumber.toUpperCase() === course.number);
    const all = courses.flatMap((c) => c.sections).filter((s) => !s.isCancelled);
    if (!all.length) return { offered: false, sections: [], instructors: [], hasStaffOnly: false };

    const primary = all.filter((s) => !SECONDARY.has(s.sectionType));
    const sections: OfferedSection[] = primary.slice(0, 10).map((s) => {
      const m = s.meetings[0];
      return {
        code: s.sectionCode,
        type: s.sectionType,
        instructors: s.instructors,
        days: m?.days ?? "TBA",
        time: m && !m.timeIsTBA ? `${hhmm(m.startTime)}-${hhmm(m.endTime)}` : "TBA",
        status: s.status,
        enrolled: num(s.numCurrentlyEnrolled?.totalEnrolled),
        capacity: num(s.maxCapacity),
        waitlist: num(s.numOnWaitlist),
      };
    });

    const names = [...new Set(primary.flatMap((s) => s.instructors))];
    const instructors = names.filter((n) => n.toUpperCase() !== "STAFF");
    return { offered: true, sections, instructors, hasStaffOnly: names.length > 0 && instructors.length === 0 };
  });
}

// ---------- Catalog + grade history ----------

export type InstructorHistory = {
  name: string;
  sectionsTaughtOfThisCourse: number; // all-time in grade records
  avgGPA: number | null; // null = no grade history for this course (new or first time)
  lastTaught: string | null;
};

export type CatalogInfo = {
  title: string;
  description: string;
  units: string;
  prerequisiteText: string;
  recentCourseGPA: { value: number | null; sections: number };
  currentInstructors: InstructorHistory[];
};

type RawSection = {
  year: string;
  quarter: string;
  averageGPA: number | null;
  instructors: string[];
};

const QUARTER_ORDER: Record<string, number> = { Winter: 1, Spring: 2, Summer1: 3, Summer10wk: 3, Summer2: 4, Fall: 5 };
const when = (s: RawSection) => Number(s.year) * 10 + (QUARTER_ORDER[s.quarter] ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function fetchCatalog(course: CourseRef, currentInstructors: string[]): Promise<CatalogInfo> {
  return cached(`catalog:${courseId(course)}:${currentInstructors.join("|")}`, 6 * HOUR, async () => {
    const dept = encodeURIComponent(course.department);
    const [info, raw] = await Promise.all([
      get<{ title: string; description: string; minUnits: number; maxUnits: number; prerequisiteText: string }>(`/courses/${encodeURIComponent(courseId(course))}`),
      get<RawSection[]>(`/grades/raw?department=${dept}&courseNumber=${encodeURIComponent(course.number)}`).catch(() => [] as RawSection[]),
    ]);

    const graded = raw.filter((s) => s.averageGPA != null);
    const newest = graded.reduce((m, s) => Math.max(m, when(s)), 0);
    const recent = graded.filter((s) => when(s) >= newest - 40);
    const recentGPA = recent.length ? recent.reduce((t, s) => t + s.averageGPA!, 0) / recent.length : null;

    // Grade history ONLY for the people teaching this quarter.
    const history: InstructorHistory[] = currentInstructors.map((name) => {
      const mine = graded.filter((s) => s.instructors.includes(name));
      const last = mine.reduce<RawSection | null>((m, s) => (!m || when(s) > when(m) ? s : m), null);
      return {
        name,
        sectionsTaughtOfThisCourse: mine.length,
        avgGPA: mine.length ? round2(mine.reduce((t, s) => t + s.averageGPA!, 0) / mine.length) : null,
        lastTaught: last ? `${last.quarter} ${last.year}` : null,
      };
    });

    return {
      title: info.title,
      description: info.description,
      units: info.minUnits === info.maxUnits ? String(info.minUnits) : `${info.minUnits}-${info.maxUnits}`,
      prerequisiteText: info.prerequisiteText,
      recentCourseGPA: { value: recentGPA == null ? null : round2(recentGPA), sections: recent.length },
      currentInstructors: history,
    };
  });
}
