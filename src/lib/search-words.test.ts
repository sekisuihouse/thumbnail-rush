import { describe, expect, it } from "vitest";
import { pickSearchWords, type WordCategory } from "./search-words";
describe("pickSearchWords", () => { it("always selects different categories", () => { const c: WordCategory[] = [{language:"en",category:"a",words:["cat"]},{language:"en",category:"b",words:["train"]}]; expect(pickSearchWords(c,"en",() => 0)).toEqual(["cat","train"]); }); });
