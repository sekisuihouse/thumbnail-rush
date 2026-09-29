import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { loadWordCategories, pickSearchWords } from "../src/lib/search-words";
import type { LanguageMode, Question } from "../src/types/game";

config({ path: join(process.cwd(), ".env.local") });

interface SearchItem { id: { videoId?: string }; snippet: { title: string; channelTitle: string; publishedAt: string; liveBroadcastContent?: string; thumbnails: Record<string, { url: string; width?: number; height?: number }> }; }
interface SearchResponse { items?: SearchItem[]; nextPageToken?: string; }
interface VideoItem { id: string; status?: { privacyStatus?: string; embeddable?: boolean }; contentDetails?: { duration?: string }; statistics?: { viewCount?: string }; snippet?: SearchItem["snippet"]; }
interface VideosResponse { items?: VideoItem[]; }

const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) throw new Error("YOUTUBE_API_KEY is required. Copy .env.example to .env.local, then export/load it before running this command.");

const targetArg = process.argv.find((arg) => arg.startsWith("--target="))?.split("=")[1];
const languageArg = process.argv.find((arg) => arg.startsWith("--language="))?.split("=")[1] as LanguageMode | undefined;
const depthArg = process.argv.find((arg) => arg.startsWith("--depth="))?.split("=")[1];
const target = clamp(Number(targetArg ?? process.env.QUESTION_POOL_TARGET ?? 1000), 1, 100_000);
const language: LanguageMode = ["ja", "en", "mixed"].includes(languageArg ?? "") ? languageArg! : "mixed";
const maxPages = clamp(Number(depthArg ?? 4), 1, 5);
const dataPath = join(process.cwd(), "data", "questions.json");
const cacheDirectory = join(process.cwd(), "data", "cache");
await mkdir(cacheDirectory, { recursive: true });
const existing = existsSync(dataPath) ? JSON.parse(await readFile(dataPath, "utf8")) as Question[] : [];
console.log(`現在の問題数：${existing.length}`);
if (existing.length >= target) { console.log(`すでに目標 ${target} 問以上あります。`); process.exit(0); }
console.log(`${target}問まで補充します。ゲーム中のAPI消費はありません。`);

const categories = loadWordCategories();
const questions = [...existing];
const seenVideoIds = new Set(questions.map((q) => q.videoId));
const channelCounts = new Map<string, number>();
for (const q of questions) channelCounts.set(q.channelTitle, (channelCounts.get(q.channelTitle) ?? 0) + 1);
let searchCalls = 0;
let detailCalls = 0;
let attempts = 0;

while (questions.length < target && attempts < Math.max(20, target * 2)) {
  attempts += 1;
  const words = pickSearchWords(categories, language);
  const pageCount = 1 + Math.floor(Math.random() * maxPages);
  let pageToken: string | undefined;
  let response: SearchResponse | null = null;
  for (let page = 0; page < pageCount; page += 1) {
    const cached = await cachedSearch(words.join(" "), pageToken);
    response = cached.data;
    if (!cached.hit) searchCalls += 1;
    pageToken = response.nextPageToken;
    if (!pageToken && page < pageCount - 1) break;
  }
  const items = response?.items ?? [];
  const ids = items.map((item) => item.id.videoId).filter((id): id is string => typeof id === "string" && !seenVideoIds.has(id));
  if (!ids.length) continue;
  const details = await youtube<VideosResponse>("videos", { part: "snippet,status,contentDetails,statistics", id: ids.join(",") });
  detailCalls += 1;
  const byId = new Map((details.items ?? []).map((item) => [item.id, item]));
  for (let index = 0; index < items.length && questions.length < target; index += 1) {
    const searchItem = items[index];
    const videoId = searchItem.id.videoId;
    const detail = videoId ? byId.get(videoId) : undefined;
    if (!videoId || !detail?.snippet || detail.status?.privacyStatus !== "public" || detail.status.embeddable === false) continue;
    if (detail.snippet.liveBroadcastContent && detail.snippet.liveBroadcastContent !== "none") continue;
    const durationSeconds = parseDuration(detail.contentDetails?.duration ?? "");
    // Keep a little Shorts variety, but stop the pool becoming Shorts-heavy.
    if (durationSeconds > 0 && durationSeconds < 61 && Math.random() < 0.8) continue;
    const title = decodeEntities(detail.snippet.title).trim();
    const thumbnailUrl = bestThumbnail(detail.snippet.thumbnails);
    if (!title || !thumbnailUrl || (channelCounts.get(detail.snippet.channelTitle) ?? 0) >= 5) continue;
    if (!(await imageExists(thumbnailUrl))) continue;
    const question: Question = {
      id: randomUUID(), videoId, title, thumbnailUrl,
      channelTitle: detail.snippet.channelTitle,
      publishedAt: detail.snippet.publishedAt,
      searchWords: words,
      searchRank: (pageCount - 1) * 50 + index + 1,
      language: detectLanguage(`${title} ${words.join(" ")}`),
      durationSeconds,
      viewCount: detail.statistics?.viewCount ? Number(detail.statistics.viewCount) : undefined,
      generatedAt: new Date().toISOString()
    };
    questions.push(question);
    seenVideoIds.add(videoId);
    channelCounts.set(question.channelTitle, (channelCounts.get(question.channelTitle) ?? 0) + 1);
  }
  await writeFile(dataPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
  process.stdout.write(`\r問題数：${questions.length}/${target}（検索API ${searchCalls}回、詳細API ${detailCalls}回）`);
}

console.log(`\n完了：${questions.length}問。推定クォータ消費は約 ${searchCalls * 100 + detailCalls} units（キャッシュヒット分を除く）。`);
if (questions.length < target) process.exitCode = 1;

async function cachedSearch(query: string, pageToken?: string): Promise<{ data: SearchResponse; hit: boolean }> {
  const key = createHash("sha256").update(`${query}|${pageToken ?? "first"}`).digest("hex");
  const path = join(cacheDirectory, `${key}.json`);
  if (existsSync(path)) return { data: JSON.parse(await readFile(path, "utf8")) as SearchResponse, hit: true };
  const data = await youtube<SearchResponse>("search", { part: "snippet", type: "video", maxResults: "50", q: query, safeSearch: "moderate", videoEmbeddable: "true", ...(pageToken ? { pageToken } : {}) });
  await writeFile(path, JSON.stringify(data), "utf8");
  return { data, hit: false };
}

async function youtube<T>(resource: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  Object.entries({ ...params, key: apiKey! }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function bestThumbnail(thumbnails: Record<string, { url: string }>): string | null {
  for (const key of ["maxres", "standard", "high", "medium", "default"]) if (thumbnails[key]?.url) return thumbnails[key].url;
  return null;
}
async function imageExists(url: string): Promise<boolean> {
  try { const response = await fetch(url, { method: "HEAD" }); return response.ok && (response.headers.get("content-type")?.startsWith("image/") ?? true); } catch { return false; }
}
function parseDuration(value: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value); if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}
function detectLanguage(value: string): "ja" | "en" { return /[\u3040-\u30ff\u3400-\u9fff]/u.test(value) ? "ja" : "en"; }
function decodeEntities(value: string): string { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.round(value || min))); }
