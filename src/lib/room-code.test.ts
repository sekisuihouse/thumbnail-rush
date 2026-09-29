import { describe, expect, it } from "vitest";
import { generateRoomCode } from "./room-code";
describe("generateRoomCode", () => { it("creates unambiguous six-character codes", () => expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)); });
