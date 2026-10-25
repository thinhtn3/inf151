import { cached, HOUR } from "../cache";

// Unofficial RateMyProfessors GraphQL endpoint. Not a supported API: it can change or
// block at any time, so callers must treat failures as "no data".
const ENDPOINT = "https://www.ratemyprofessors.com/graphql";
const UCI_SCHOOL_ID = "U2Nob29sLTEwNzQ="; // School-1074

type RmpTeacher = {
  legacyId: number;
  firstName: string;
  lastName: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  wouldTakeAgainPercent: number;
  ratings: { edges: { node: { class: string; comment: string; difficultyRating: number } }[] };
};

export type ProfessorRating = {
  name: string;
  url: string; // the professor's RateMyProfessors page
  rating: number;
  difficulty: number;
  numRatings: number;
  wouldTakeAgainPercent: number | null;
  comments: { course: string; text: string; difficulty: number }[];
};

const QUERY = `query($text: String!, $schoolID: ID!) {
  newSearch { teachers(query: {text: $text, schoolID: $schoolID}, first: 3) { edges { node {
    legacyId firstName lastName avgRating avgDifficulty numRatings wouldTakeAgainPercent
    ratings(first: 40) { edges { node { class comment difficultyRating } } }
  } } } }
}`;

// Anteater gives "LAST, F." — search by last name and match the first initial.
export function lookupProfessor(anteaterName: string, courseLabel: string): Promise<ProfessorRating | null> {
  return cached(`rmp:v2:${anteaterName}:${courseLabel}`, 24 * HOUR, async () => {
    const [last, first = ""] = anteaterName.split(",").map((s) => s.trim());
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Basic dGVzdDp0ZXN0",
        "Content-Type": "application/json",
        "User-Agent": "uci-course-recommender (class project)",
      },
      // The UCI schedule cuts long surnames at ~10 characters ("VENKATASUBRAMA"), so search on a shorter prefix.
      body: JSON.stringify({ query: QUERY, variables: { text: last.length >= 10 ? last.slice(0, 8) : last, schoolID: UCI_SCHOOL_ID } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`RMP ${res.status}`);
    const json = await res.json();
    const nodes = ((json.data?.newSearch?.teachers?.edges ?? []) as { node: RmpTeacher }[]).map((e) => e.node);
    const initial = first.replace(/\./g, "").charAt(0).toLowerCase();
    const match = nodes.find((n) => (last.length >= 10 ? n.lastName.toLowerCase().startsWith(last.toLowerCase()) : n.lastName.toLowerCase() === last.toLowerCase()) && n.firstName.toLowerCase().startsWith(initial));
    if (!match || match.numRatings === 0) return null;

    const courseKey = courseLabel.replace(/[^A-Z0-9]/gi, "").toLowerCase();
    const all = (match.ratings.edges as { node: { class: string; comment: string; difficultyRating: number } }[]).map((e) => e.node);
    const forCourse = all.filter((r) => r.class.replace(/[^A-Z0-9]/gi, "").toLowerCase().endsWith(courseKey.replace(/^[a-z]+/, "")));
    const picked = (forCourse.length ? forCourse : all).filter((r) => r.comment.length > 40).slice(0, 4);

    return {
      name: `${match.firstName} ${match.lastName}`,
      url: `https://www.ratemyprofessors.com/professor/${match.legacyId}`,
      rating: match.avgRating,
      difficulty: match.avgDifficulty,
      numRatings: match.numRatings,
      wouldTakeAgainPercent: match.wouldTakeAgainPercent >= 0 ? match.wouldTakeAgainPercent : null,
      comments: picked.map((r) => ({ course: r.class, text: r.comment.slice(0, 400), difficulty: r.difficultyRating })),
    };
  });
}
