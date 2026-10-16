export type CourseRef = { department: string; number: string; label: string };

// Common student shorthand -> Anteater department codes
const ALIASES: Record<string, string> = {
  ICS: "I&C SCI",
  "I&CSCI": "I&C SCI",
  "I&C SCI": "I&C SCI",
  CS: "COMPSCI",
  CSE: "CSE",
  INF: "IN4MATX",
  INFORMATICS: "IN4MATX",
  STATS: "STATS",
  MATH: "MATH",
  WRITING: "WRITING",
  PHYSICS: "PHYSICS",
};

export function parseCourse(input: string): CourseRef | null {
  const m = input.trim().toUpperCase().match(/^([A-Z&][A-Z&0-9 ]*?)\s*([0-9]+[A-Z]*)$/);
  if (!m) return null;
  const dept = m[1].trim();
  const department = ALIASES[dept] ?? dept;
  return { department, number: m[2], label: `${department} ${m[2]}` };
}

export function courseId(c: CourseRef) {
  return `${c.department.replace(/ /g, "")}${c.number}`;
}

// A course code such as "I&CSCI 51", "IN4MATX 191A", "COMPSCI 141", "MATH 2A", "I&C Sci 6N"
export const CODE = /\b(I&C ?Sci|[A-Za-z][A-Za-z&0-9]{1,9})\s+(\d{1,3}[A-Za-z]{0,3})\b/gi;

const KNOWN_DEPTS = new Set([...Object.keys(ALIASES), ...Object.values(ALIASES), "SWE", "GDIM", "ENGRMAE", "EECS", "ECON", "PSYCH", "BIO SCI", "CHEM"]);

// Free chat text ("take 2 easy classes") contains plenty of word+number pairs that are not courses,
// so a department must be a known one or typed in capitals (e.g. "BIOSCI 94").
function plausibleDept(raw: string) {
  const d = raw.replace(/\s+/g, " ").trim();
  return KNOWN_DEPTS.has(d.toUpperCase()) || (d === d.toUpperCase() && /[A-Z&]{3}/.test(d));
}

/** Splits a chat message into the course codes it mentions and the remaining words (the preferences). */
export function extractCourses(text: string): { courses: CourseRef[]; rest: string } {
  const courses: CourseRef[] = [];
  const stripped = text.replace(new RegExp(CODE.source, "gi"), (match, dept: string, num: string) => {
    const ref = plausibleDept(dept) ? parseCourse(`${dept} ${num}`) : null;
    if (!ref) return match;
    if (!courses.some((c) => c.label === ref.label)) courses.push(ref);
    return "";
  });
  const rest = stripped
    .replace(/(\s*[,;]\s*){2,}/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.\-–—&]+|[\s,;:\-–—&]+$/g, "")
    .replace(/^(and|or)\s+|\s+(and|or)$/gi, "")
    .trim();
  return { courses, rest };
}
