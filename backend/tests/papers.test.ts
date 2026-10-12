/**
 * Papers kept from the trip (services/papers.ts, Oct 12 2026): only a real photo, picture or PDF is kept; the phone's
 * small copy only in its own shape; her town names without her planning words. Pure logic; nothing stored.
 */
import { describe, it, expect } from "vitest";
import { paperFile, townName } from "../src/services/papers.js";

const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/";
describe("what can be kept", () => {
  it("a photo, a picture or a PDF, with the phone's small copy when it's a JPEG", () => {
    const f = paperFile({ mediaType: "image/jpeg", data: JPEG, name: "IMG_1.jpg", thumb: `data:image/jpeg;base64,${JPEG}` });
    expect(typeof f).toBe("object");
    expect((f as any).thumb).toMatch(/^data:image\/jpeg;base64,/);
    expect(typeof paperFile({ mediaType: "application/pdf", data: "JVBERi0xLjQK" })).toBe("object");
  });
  it("anything else is refused, said plainly", () => {
    expect(paperFile({ mediaType: "text/plain", data: "aGVsbG8=" })).toMatch(/photo, a picture or a PDF/);
    expect(paperFile({ mediaType: "image/jpeg", data: "not base64 at all!" })).toMatch(/couldn't be read/);
    expect(paperFile({ mediaType: "image/jpeg", data: "A".repeat(14_500_000) })).toMatch(/too large/);
    expect(paperFile(null)).toMatch(/photo, a picture or a PDF/);
  });
  it("a small copy in any other shape is left out", () => {
    expect((paperFile({ mediaType: "image/jpeg", data: JPEG, thumb: "javascript:alert(1)" }) as any).thumb).toBeNull();
    expect((paperFile({ mediaType: "image/jpeg", data: JPEG, thumb: `data:image/png;base64,${JPEG}` }) as any).thumb).toBeNull();
  });
});

describe("the town a day is in", () => {
  it("her city names, without her planning words", () => {
    expect(townName("Karatsu ")).toBe("Karatsu");
    expect(townName("Okayama - WHERE IS BIZEN TOUR STARTING")).toBe("Okayama");
    expect(townName("Karatsu , day trip to Arita)")).toBe("Karatsu");
    expect(townName("Tokyo")).toBe("Tokyo");
  });
});
