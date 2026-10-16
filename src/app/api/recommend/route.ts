import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { parseCourse, type CourseRef } from "@/lib/courses";
import { fetchCatalog, fetchOffering, fetchTerms, type Term } from "@/lib/sources/anteater";
import { lookupProfessor } from "@/lib/sources/rmp";
import type { Row, Verdict } from "@/lib/types";
// Reddit is a placeholder for now (PullPush rate-limits automated access); re-enable when a source is sorted out.
// import { searchReddit } from "@/lib/sources/reddit";

export const maxDuration = 300;

// Generous sanity cap (not a product limit): protects the free upstream APIs from a runaway request.
const MAX_COURSES = 60;
const CONCURRENCY = 5; // courses researched at a time (Anteater allows 1000 requests/hour; RMP is unofficial)

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// Gemini (free tier) when GOOGLE_GENERATIVE_AI_API_KEY is set; otherwise the Vercel AI Gateway
// (needs AI_GATEWAY_API_KEY). RECOMMENDER_MODEL overrides the model id for whichever is active.
function pickModel() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return google(process.env.RECOMMENDER_MODEL ?? "gemini-2.5-flash");
  return process.env.RECOMMENDER_MODEL ?? "anthropic/claude-sonnet-5.5";
}

const Request = z.object({
  courses: z.array(z.string().min(1).max(40)).min(1).max(MAX_COURSES),
  preferences: z.string().max(1000).default(""),
  currentlyTaking: z.array(z.string().min(1).max(40)).max(20).default([]), // in-progress courses, for workload context
  term: z.object({ year: z.string(), quarter: z.string() }).optional(), // defaults to the latest posted term
});

const Recommendation = z.object({
  course: z.string().describe("The course label exactly as given in the data, e.g. 'I&C SCI 33'"),
  verdict: z.enum(["take", "caveats", "skip"]).describe("take = strong fit; caveats = workable with real downsides; skip = poor fit or better to delay"),
  summary: z.string().describe("2-3 sentences tying the evidence to what the student asked for"),
  warning: z.string().describe("One short warning (full section, prerequisite, required course, workload) or an empty string"),
  evidence: z.enum(["none", "limited", "some", "strong"]).describe("How much data backs this call"),
});

const Output_ = z.object({
  recommendations: z.array(Recommendation).describe("Every course given, ordered best fit first"),
});

const EVIDENCE = { none: 0, limited: 1, some: 2, strong: 3 } as const;

async function gatherCourse(course: CourseRef, term: Term, compact: boolean) {
  const offering = await fetchOffering(course, term).catch((e) => ({ error: String(e.message ?? e) }));
  if ("error" in offering) return { course: course.label, status: "schedule-error" as const, error: offering.error };
  if (!offering.offered) return { course: course.label, status: "not-offered" as const };

  const catalog = await fetchCatalog(course, offering.instructors).catch((e) => ({ error: String(e.message ?? e) }));
  if ("error" in catalog) return { course: course.label, status: "catalog-error" as const, error: catalog.error };

  // RateMyProfessors research for the people actually teaching this quarter, and only them.
  const professors = await Promise.all(
    catalog.currentInstructors.map(async (i) => {
      const rmp = await lookupProfessor(i.name, course.label).catch(() => null);
      if (rmp && compact) rmp.comments = rmp.comments.slice(0, 2).map((c) => ({ ...c, text: c.text.slice(0, 220) }));
      return { ...i, rmp };
    }),
  );

  return {
    course: course.label,
    status: "ok" as const,
    term: term.label,
    title: catalog.title,
    description: compact ? catalog.description.slice(0, 200) : catalog.description,
    units: catalog.units,
    prerequisites: catalog.prerequisiteText,
    recentCourseGPA: catalog.recentCourseGPA,
    sectionsThisQuarter: offering.sections,
    professorsThisQuarter: professors,
    onlyStaffListed: offering.hasStaffOnly,
  };
}

type Gathered = Awaited<ReturnType<typeof gatherCourse>>;
type Found = Extract<Gathered, { status: "ok" }>;

// The table columns come straight from the fetched data (not from the model), so they can't be invented.
function facts(g: Found): Pick<Row, "code" | "title" | "instructor" | "rating" | "gpa" | "seats"> {
  const profs = g.professorsThisQuarter;
  const lead = profs[0];
  const names = profs.slice(0, 2).map((p) => p.name).join(" / ") + (profs.length > 2 ? ` +${profs.length - 2}` : "");
  return {
    code: g.course,
    title: g.title,
    instructor: names || (g.onlyStaffListed ? "STAFF" : "Not announced"),
    rating: lead?.rmp ? `${lead.rmp.rating.toFixed(1)} (${lead.rmp.numRatings})` : "No ratings",
    gpa: lead?.avgGPA != null ? lead.avgGPA.toFixed(2) : "No data",
    seats: g.sectionsThisQuarter.length > 0 && g.sectionsThisQuarter.every((s) => s.status !== "OPEN") ? "Full" : "Open",
  };
}

const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function POST(req: Request) {
  const parsed = Request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return Response.json({ error: `Invalid request (${why}). Send { courses: string[1-${MAX_COURSES}], preferences?: string, currentlyTaking?: string[<=20] }` }, { status: 400 });
  }

  const refs: CourseRef[] = [];
  const unparsed: string[] = [];
  for (const raw of parsed.data.courses) {
    const ref = parseCourse(raw);
    if (ref) refs.push(ref);
    else unparsed.push(raw);
  }
  if (!refs.length) return Response.json({ error: `Couldn't read any course codes (try "ICS 33" or "COMPSCI 161").`, unparsed }, { status: 400 });

  const terms = await fetchTerms().catch(() => [] as Term[]);
  const term = (parsed.data.term && terms.find((t) => t.year === parsed.data.term!.year && t.quarter === parsed.data.term!.quarter)) || terms[0];
  if (!term) return Response.json({ error: "Couldn't load the quarter schedule right now." }, { status: 502 });

  // With long lists, send less text per course so the model request stays within free-tier token limits.
  const compact = refs.length > 12;
  const gathered = await mapPool(refs, CONCURRENCY, (r) => gatherCourse(r, term, compact));
  const found = gathered.filter((g): g is Found => g.status === "ok");
  const notOffered = gathered.filter((g) => g.status === "not-offered").map((g) => g.course);
  const noData = [...gathered.filter((g) => g.status === "schedule-error" || g.status === "catalog-error").map((g) => g.course), ...unparsed];

  // ?raw=1 returns the fetched data without calling the model (handy for dev / checking sources).
  if (new URL(req.url).searchParams.get("raw") === "1") return Response.json({ term, gathered, notOffered, noData });

  if (!found.length) {
    return Response.json(
      { error: notOffered.length ? `None of those courses are offered in ${term.label}: ${notOffered.join(", ")}.` : "No course data found for those codes.", notOffered, noData },
      { status: 404 },
    );
  }

  const { output } = await generateText({
    model: pickModel(),
    output: Output.object({ schema: Output_ }),
    system:
      "You rank UC Irvine courses for ONE specific quarter. You receive pre-fetched data per course: catalog info, the " +
      "sections and professors actually teaching THIS quarter (from the live schedule, including whether sections are open or full), " +
      "each current professor's grade history in this course, and their RateMyProfessors ratings and student reviews. Use ONLY that data; " +
      "never invent professors, ratings, or opinions, and only mention professors listed for this quarter. A professor with no grade " +
      "history or no RMP data is new/unknown: say so. If only STAFF is listed, say the instructor isn't announced yet. Rank every course " +
      "for this student's stated preferences, best fit first, and set evidence honestly (few sections, few ratings, or no RMP data means " +
      "limited or none). GPA is a proxy for difficulty, not quality. If several candidates satisfy the same requirement, rank them " +
      "against each other. Keep each summary short and concrete.",
    prompt:
      `Quarter: ${term.label}\nStudent preferences: ${parsed.data.preferences || "(none given)"}\n` +
      `Courses the student is already taking now (consider total workload, do not recommend them): ${parsed.data.currentlyTaking.join(", ") || "(none given)"}\n\n` +
      `Course data (JSON):\n${JSON.stringify(found, null, 1)}`,
  });

  // Merge: the model's order and judgment + the facts we fetched. Never drop a course the model forgot.
  const byKey = new Map(found.map((g) => [key(g.course), g]));
  const rows: Row[] = [];
  for (const r of output.recommendations) {
    const g = byKey.get(key(r.course));
    if (!g) continue;
    byKey.delete(key(r.course));
    rows.push({ ...facts(g), verdict: r.verdict as Verdict, summary: r.summary, warning: r.warning.trim(), evidence: EVIDENCE[r.evidence] });
  }
  for (const g of byKey.values()) {
    rows.push({ ...facts(g), verdict: "caveats", summary: "The ranking didn't return an assessment for this course.", warning: "", evidence: 0 });
  }

  return Response.json({ term, rows, notOffered, noData });
}

export async function GET() {
  return Response.json({ terms: await fetchTerms().catch(() => []) });
}
