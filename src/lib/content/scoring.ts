import type { ContentCandidate, ContentKeyword } from "./types";

export function scoreCandidate(
  candidate: ContentCandidate,
  keywords: ContentKeyword[]
) {
  const text = `${candidate.title} ${candidate.description ?? ""}`.toLocaleLowerCase();
  const categoryScores = new Map<string, number>();
  let rawScore = 0;

  for (const keyword of keywords) {
    const needle = keyword.keyword.trim().toLocaleLowerCase();
    if (!needle) {
      continue;
    }

    if (text.includes(needle)) {
      rawScore += keyword.weight;
      categoryScores.set(
        keyword.category,
        (categoryScores.get(keyword.category) ?? 0) + keyword.weight
      );
    }
  }

  let category: string | null = null;
  let categoryScore = 0;

  for (const [name, score] of categoryScores) {
    if (score > categoryScore) {
      category = name;
      categoryScore = score;
    }
  }

  return {
    category,
    score: Math.min(Math.max(rawScore, 0), 20)
  };
}
