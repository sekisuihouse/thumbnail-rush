import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Difficulty, LanguageMode, Question } from "@/types/game";

let cached: Question[] | null = null;

export function loadQuestionPool(): Question[] {
  if (cached) return cached;
  const path = join(process.cwd(), "data", "questions.json");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("data/questions.json must be an array");
  cached = parsed.filter(isQuestion);
  if (!cached.length) throw new Error("Question pool is empty. Run npm run generate-questions.");
  return cached;
}

function isQuestion(value: unknown): value is Question {
  if (!value || typeof value !== "object") return false;
  const q = value as Partial<Question>;
  return [q.id, q.videoId, q.title, q.thumbnailUrl, q.channelTitle, q.publishedAt]
    .every((field) => typeof field === "string" && field.length > 0) && Array.isArray(q.searchWords);
}

export function selectQuestions(
  pool: Question[],
  count: number,
  language: LanguageMode,
  difficulty: Difficulty,
  searchDepth = 1,
  minViewCount = 0,
  random: () => number = Math.random
): Question[] {
  const filtered = pool.filter((q) => language === "mixed" || !q.language || q.language === language);
  if (!filtered.length) {
    throw new Error(`${language === "ja" ? "日本語" : "英語"}の問題がありません。問題プールを補充してください。`);
  }
  const source = filtered.filter((q) => minViewCount === 0 || (q.viewCount !== undefined && q.viewCount >= minViewCount));
  if (!source.length) {
    throw new Error(`再生回数 ${minViewCount.toLocaleString()} 回以上の問題がありません。問題プールを補充してください。`);
  }
  if (source.length < count) {
    throw new Error(`設定に合う問題は ${source.length} 問です。ラウンド数を減らすか、問題プールを補充してください。`);
  }
  const depthFloor: Record<Difficulty, number> = { EASY: 0, NORMAL: 25, HARD: 75, CHAOS: 125 };
  const minimumRank = Math.max(depthFloor[difficulty], (Math.max(1, searchDepth) - 1) * 50 + 1);
  const preferred = source.filter((q) => q.searchRank >= minimumRank);
  const candidates = preferred.length >= count ? preferred : source;
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}
