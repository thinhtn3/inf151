// Display-only: the "Understood" chips. The model reads the raw text; this just echoes what we picked up.
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, "1": 1, "2": 2, "3": 3, "4": 4 };

export function parsePriorities(text: string): string[] {
  const t = text.toLowerCase();
  const chips: string[] = [];
  if (/light|easy workload|low workload|not too much work/.test(t)) chips.push("Light workload");
  if (/lecturer|clear|engaging|good professor|teaching/.test(t)) chips.push("Clear lecturer");
  if (/gpa|grade|easy/.test(t)) chips.push("High average GPA");
  if (/full|open seat|enroll/.test(t)) chips.push("Avoid full sections");
  const load = t.match(/(one|two|three|four|\d)\s+(?:other\s+)?(?:hard|difficult|heavy|tough)/);
  if (load && WORDS[load[1]]) chips.push(`Already taking ${WORDS[load[1]]} hard`);
  return chips;
}
