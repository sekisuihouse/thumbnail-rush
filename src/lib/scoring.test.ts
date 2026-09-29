import { describe, expect, it } from "vitest";
import { calculateScore } from "./scoring";
describe("calculateScore", () => { it("adds a configurable speed bonus", () => { expect(calculateScore(120, 0)).toBe(160); expect(calculateScore(120, 120000)).toBe(100); }); });
