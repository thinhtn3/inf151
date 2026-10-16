import { cached, HOUR } from "../cache";
import type { CourseRef } from "../courses";

// Reddit access goes through PullPush (https://pullpush.io), a third-party Reddit archive.
// It may rate-limit or refuse automated requests (it returned HTTP 429 in testing), so every
// failure here is reported as "unavailable" rather than breaking the recommendation.
// Swap this module out (e.g. for the official Reddit API) without touching the rest of the app.
const BASE = process.env.PULLPUSH_BASE_URL ?? "https://api.pullpush.io/reddit/search";

export type RedditThread = { title: string; snippet: string; score: number; comments: number; date: string; url: string };
export type RedditResult = { status: "ok"; threads: RedditThread[] } | { status: "unavailable"; reason: string };

type Submission = { title: string; selftext?: string; score: number; num_comments: number; created_utc: number; permalink: string };

export async function searchReddit(course: CourseRef): Promise<RedditResult> {
  try {
    return await cached(`reddit:${course.label}`, 12 * HOUR, () => fetchThreads(course));
  } catch (err) {
    // Failures are thrown out of the cache loader so they are never cached.
    return { status: "unavailable", reason: err instanceof Error ? err.message : "request failed" };
  }
}

async function fetchThreads(course: CourseRef): Promise<RedditResult> {
  {
    // Students write "ICS 33", "I&C SCI 33", "ics33"; query the variants we know about.
    const q = course.department === "I&C SCI" ? `ICS ${course.number}` : `${course.department} ${course.number}`;
    {
      const res = await fetch(`${BASE}/submission/?subreddit=UCI&q=${encodeURIComponent(q)}&size=10&sort=desc&sort_type=score`, {
        headers: { "User-Agent": "uci-course-recommender (class project)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`PullPush returned HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Submission[] };
      const threads = (body.data ?? []).slice(0, 6).map((s) => ({
        title: s.title,
        snippet: (s.selftext ?? "").replace(/\s+/g, " ").slice(0, 400),
        score: s.score,
        comments: s.num_comments,
        date: new Date(s.created_utc * 1000).toISOString().slice(0, 10),
        url: `https://reddit.com${s.permalink}`,
      }));
      return { status: "ok", threads };
    }
  }
}
