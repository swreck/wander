/**
 * WHERE A NOTE TOLD TO SCOUT IS FILED (Oct 10 2026 re-audit): Ken told Scout about "a little shop in arita" on a Hakata day
 * and the note was filed under Hakata. Scout may now name the town — used only when the person's own words name it, so
 * Scout can't file a note somewhere their words don't say.
 * - their words name the town → that town (capitalised)
 * - a town their words don't name → nothing (the day's city is used)
 * - nothing, blank, a long string, a part of a word → nothing
 */
import { describe, it, expect } from "vitest";

process.env.JWT_SECRET = "test-secret-note-place";
const { placeInWords } = await import("../src/routes/chat.js");

const words = "we stopped at a little shop in arita where the owner made us green tea";

describe("a note's town comes from their own words", () => {
  it("names the town their words name", () => {
    expect(placeInWords("Arita", words)).toBe("Arita");
    expect(placeInWords("arita", words)).toBe("Arita");
  });
  it("ignores a town their words don't name", () => {
    expect(placeInWords("Imari", words)).toBeNull();
    expect(placeInWords("Hakata", words)).toBeNull();
  });
  it("ignores nothing, blanks, long strings and parts of words", () => {
    expect(placeInWords(undefined, words)).toBeNull();
    expect(placeInWords("   ", words)).toBeNull();
    expect(placeInWords("x".repeat(41), words)).toBeNull();
    expect(placeInWords("rita", words)).toBeNull();
    expect(placeInWords("Ari.a", words)).toBeNull();
  });
});
