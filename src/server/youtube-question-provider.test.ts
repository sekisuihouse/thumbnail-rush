import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameSettings } from "@/types/game";

const settings: GameSettings = {
  rounds: 2, roundSeconds: 120, searchDepth: 1, minViewCount: 10_000,
  language: "ja", difficulty: "NORMAL"
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateLiveQuestions", () => {
  it("requires a server-side API key", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const { generateLiveQuestions } = await import("./youtube-question-provider");
    await expect(generateLiveQuestions(settings, 1)).rejects.toThrow("YOUTUBE_API_KEY");
  });

  it("fetches a distinct API-selected video for every round", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    let searchCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        searchCount += 1;
        return Response.json({ items: [{ id: { videoId: `video-${searchCount}` }, snippet: { title: `日本語動画${searchCount}`, channelTitle: "channel", publishedAt: "2026-01-01T00:00:00Z", liveBroadcastContent: "none" } }] });
      }
      const id = url.searchParams.get("id")!;
      return Response.json({ items: [{ id, status: { privacyStatus: "public", embeddable: true }, contentDetails: { duration: "PT3M" }, statistics: { viewCount: "50000" }, snippet: { title: `日本語動画${searchCount}`, channelTitle: "channel", publishedAt: "2026-01-01T00:00:00Z", liveBroadcastContent: "none", thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } } } }] });
    }));
    const { generateLiveQuestions } = await import("./youtube-question-provider");
    const questions = await generateLiveQuestions(settings, 2);
    expect(questions.map((question) => question.videoId)).toEqual(["video-1", "video-2"]);
    expect(new Set(questions.map((question) => question.videoId)).size).toBe(2);
  });
});
