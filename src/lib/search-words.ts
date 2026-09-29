import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LanguageMode } from "@/types/game";

export interface WordCategory { language: string; category: string; words: string[]; }

export function loadWordCategories(directory = join(process.cwd(), "data", "search-words")): WordCategory[] {
  return readdirSync(directory).filter((file) => file.endsWith(".json")).flatMap((file) => {
    const data = JSON.parse(readFileSync(join(directory, file), "utf8")) as { language: string; categories: Record<string, string[]> };
    return Object.entries(data.categories).map(([category, words]) => ({
      language: category.endsWith("_ja") ? "ja" : category.endsWith("_en") ? "en" : data.language,
      category: `${file}:${category}`,
      words
    }));
  }).filter((entry) => entry.words.length > 0);
}

export function pickSearchWords(categories: WordCategory[], language: LanguageMode, random = Math.random): [string, string] {
  const eligible = categories.filter((item) => language === "mixed" || item.language === language);
  if (eligible.length < 2) throw new Error("At least two search-word categories are required");
  const firstIndex = Math.floor(random() * eligible.length);
  let secondIndex = Math.floor(random() * (eligible.length - 1));
  if (secondIndex >= firstIndex) secondIndex += 1;
  const first = eligible[firstIndex];
  const second = eligible[secondIndex];
  return [first.words[Math.floor(random() * first.words.length)], second.words[Math.floor(random() * second.words.length)]];
}
