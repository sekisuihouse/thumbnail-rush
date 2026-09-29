export interface MatchResult {
  match: boolean;
  method: "exact" | "normalized" | "similar" | "none";
  similarity: number;
}

export function normalizeTitle(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ja-JP")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/gu, " ");
}

function comparable(input: string): string {
  return normalizeTitle(input)
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .replace(/[「」『』【】［］（）()]/gu, "");
}

export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = old;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function matchTitle(answer: string, expected: string): MatchResult {
  if (answer.trim() === expected.trim()) return { match: true, method: "exact", similarity: 1 };
  const normalizedAnswer = normalizeTitle(answer);
  const normalizedExpected = normalizeTitle(expected);
  if (normalizedAnswer === normalizedExpected) return { match: true, method: "normalized", similarity: 1 };

  const a = comparable(answer);
  const b = comparable(expected);
  const similarity = levenshteinSimilarity(a, b);
  // Short titles need near certainty; long titles tolerate only a small number of typos.
  const threshold = Math.max(a.length, b.length) < 10 ? 0.94 : 0.9;
  const lengthRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length, 1);
  const match = a.length >= 4 && lengthRatio >= 0.86 && similarity >= threshold;
  return { match, method: match ? "similar" : "none", similarity };
}
