import { describe, expect, it } from "vitest";
import { matchTitle, normalizeTitle } from "./title-match";

describe("normalizeTitle", () => {
  it("normalizes case, width, unicode and whitespace", () => expect(normalizeTitle("  ＨＥＬＬＯ　 World  ")).toBe("hello world"));
});
describe("matchTitle", () => {
  it("accepts normalized matches", () => expect(matchTitle("Ｎｙａｎ   Ｃａｔ", "nyan cat").match).toBe(true));
  it("accepts a small typo in a long title", () => expect(matchTitle("Never Gonna Give You Up Offical Video", "Never Gonna Give You Up Official Video").match).toBe(true));
  it("rejects different titles", () => expect(matchTitle("cat video", "dog compilation").match).toBe(false));
});
