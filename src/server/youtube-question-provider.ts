import { randomUUID } from "node:crypto";
import { loadWordCategories, pickSearchWords } from "../lib/search-words";
import type { GameSettings, Question } from "../types/game";

interface SearchItem {
  id: { videoId?: string };
  snippet: { title: string; channelTitle: string; publishedAt: string; liveBroadcastContent?: string };
}
interface SearchResponse { items?: SearchItem[]; nextPageToken?: string; }
interface VideoItem {
  id: string;
  status?: { privacyStatus?: string; embeddable?: boolean };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  snippet?: SearchItem["snippet"] & { thumbnails?: Record<string, { url: string }> };
}
interface VideosResponse { items?: VideoItem[]; }

const categories = loadWordCategories();

export async function generateLiveQuestions(settings: GameSettings, count: number): Promise<Question[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEYが未設定です。サーバーの.env.localに設定してください。");

  const questions: Question[] = [];
  const usedVideoIds = new Set<string>();
  const usedQueries = new Set<string>();
  const maxAttempts = Math.max(20, count * 8);

  for (let attempt = 0; questions.length < count && attempt < maxAttempts; attempt += 1) {
    const queryLanguage = settings.language === "mixed" ? (Math.random() < 0.5 ? "ja" : "en") : settings.language;
    const words = pickSearchWords(categories, queryLanguage);
    const query = words.join(" ");
    if (usedQueries.has(query)) continue;
    usedQueries.add(query);

    const pageCount = choosePageCount(settings);
    let pageToken: string | undefined;
    let searchResult: SearchResponse | null = null;
    let reachedPage = 0;
    for (let page = 1; page <= pageCount; page += 1) {
      searchResult = await youtube<SearchResponse>(apiKey, "search", {
        part: "snippet", type: "video", maxResults: "50", q: query,
        safeSearch: "moderate", videoEmbeddable: "true",
        relevanceLanguage: queryLanguage,
        ...(queryLanguage === "ja" ? { regionCode: "JP" } : {}),
        ...(pageToken ? { pageToken } : {})
      });
      reachedPage = page;
      pageToken = searchResult.nextPageToken;
      if (!pageToken && page < pageCount) break;
    }

    const ids = (searchResult?.items ?? [])
      .map((item) => item.id.videoId)
      .filter((id): id is string => typeof id === "string" && !usedVideoIds.has(id));
    if (!ids.length) continue;

    const details = await youtube<VideosResponse>(apiKey, "videos", {
      part: "snippet,status,contentDetails,statistics", id: ids.join(",")
    });
    const candidates = (details.items ?? []).filter((video) => isEligible(video, settings, queryLanguage, usedVideoIds));
    if (!candidates.length) continue;
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    const snippet = selected.snippet!;
    const thumbnailUrl = bestThumbnail(snippet.thumbnails ?? {});
    if (!thumbnailUrl) continue;
    const pageItems = searchResult?.items ?? [];
    const pageIndex = Math.max(0, pageItems.findIndex((item) => item.id.videoId === selected.id));
    const viewCount = Number(selected.statistics?.viewCount ?? 0);

    usedVideoIds.add(selected.id);
    questions.push({
      id: randomUUID(), videoId: selected.id, title: decodeEntities(snippet.title), thumbnailUrl,
      channelTitle: snippet.channelTitle, publishedAt: snippet.publishedAt,
      searchWords: words, searchRank: (reachedPage - 1) * 50 + pageIndex + 1,
      language: queryLanguage, durationSeconds: parseDuration(selected.contentDetails?.duration ?? ""),
      viewCount, generatedAt: new Date().toISOString()
    });
  }

  if (questions.length < count) {
    throw new Error(`条件に合う動画を${count}問確保できませんでした（${questions.length}問取得）。条件を緩めて再試行してください。`);
  }
  return questions;
}

function choosePageCount(settings: GameSettings): number {
  const max = Math.max(1, Math.min(5, settings.searchDepth));
  const minimum = settings.difficulty === "CHAOS" ? Math.max(1, max - 1) : settings.difficulty === "HARD" ? Math.min(2, max) : 1;
  return minimum + Math.floor(Math.random() * (max - minimum + 1));
}

function isEligible(video: VideoItem, settings: GameSettings, language: "ja" | "en", used: Set<string>): boolean {
  const snippet = video.snippet;
  if (!snippet || used.has(video.id) || !snippet.title.trim()) return false;
  if (video.status?.privacyStatus !== "public" || video.status.embeddable === false) return false;
  if (snippet.liveBroadcastContent && snippet.liveBroadcastContent !== "none") return false;
  const viewCount = Number(video.statistics?.viewCount ?? 0);
  if (!Number.isFinite(viewCount) || viewCount < settings.minViewCount) return false;
  const duration = parseDuration(video.contentDetails?.duration ?? "");
  if (duration > 0 && duration < 61) return false;
  const isJapanese = /[\u3040-\u30ff\u3400-\u9fff]/u.test(snippet.title);
  return language === "ja" ? isJapanese : !isJapanese;
}

async function youtube<T>(apiKey: string, resource: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const body = await response.text();
    const reason = response.status === 403 ? "APIキーまたはクォータを確認してください" : `HTTP ${response.status}`;
    throw new Error(`YouTube APIエラー: ${reason} (${body.slice(0, 180)})`);
  }
  return response.json() as Promise<T>;
}

function bestThumbnail(thumbnails: Record<string, { url: string }>): string | null {
  for (const key of ["maxres", "standard", "high", "medium", "default"]) if (thumbnails[key]?.url) return thumbnails[key].url;
  return null;
}
function parseDuration(value: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
}
function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
