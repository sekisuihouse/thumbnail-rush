import { describe, expect, it } from "vitest";
import type { Question } from "@/types/game";
import { selectQuestions } from "./question-pool";
const q = (id: string, rank: number, language: "ja"|"en", viewCount = 0): Question => ({id,videoId:id,title:id,thumbnailUrl:"https://x.test/x.jpg",channelTitle:"c",publishedAt:"now",searchWords:["a","b"],searchRank:rank,language,viewCount});
describe("selectQuestions", () => {
  it("filters language and avoids low rank for hard games when possible", () => { const selected = selectQuestions([q("a",10,"ja"),q("b",100,"ja"),q("c",150,"en")],1,"ja","HARD",1,0,() => .1); expect(selected[0].id).toBe("b"); });
  it("applies the minimum view count", () => { const selected = selectQuestions([q("small",100,"ja",9999),q("large",100,"ja",10000)],1,"ja","NORMAL",1,10000,() => .1); expect(selected[0].id).toBe("large"); });
  it("does not fall back to another language", () => { expect(() => selectQuestions([q("en",100,"en")],1,"ja","NORMAL")).toThrow("日本語"); });
  it("never repeats questions to fill extra rounds", () => { expect(() => selectQuestions([q("only",100,"ja")],2,"ja","NORMAL")).toThrow("ラウンド数"); });
});
