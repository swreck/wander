/**
 * "Scout answered" on the lock screen (services/push.ts, Oct 12 2026): what reaches the lock screen, and that only a real
 * phone push address is kept. Pure logic; no database, nothing sent.
 */
import { describe, it, expect } from "vitest";
import { answerPreview, parseSubscription } from "../src/services/push.js";

describe("the lock screen's words", () => {
  it("the answer's first line, without ** marks or web addresses", () => {
    expect(answerPreview("**Doutor Coffee** is about 20 m to the north-east, open now.\n\nTully's is about 80 m away.")).toBe("Doutor Coffee is about 20 m to the north-east, open now.");
    expect(answerPreview("Her map: https://www.google.com/maps/d/viewer?mid=abc — the pottery layer.")).toBe("Her map: a link — the pottery layer.");
  });
  it("a long line is cut at a word, with …", () => {
    const out = answerPreview("word ".repeat(60));
    expect(out.length).toBeLessThanOrEqual(141);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
  it("a line with a booking code or a long number stays off the lock screen", () => {
    expect(answerPreview("Your flight's confirmation is C4GMXN, seat 32A.")).toBe("Your answer is ready. Tap to read it.");
    expect(answerPreview("Room 1204 is on the 12th floor.")).toBe("Your answer is ready. Tap to read it.");
    expect(answerPreview("Dinner is at 7:30 PM at Sushi Yoshitake.")).toBe("Dinner is at 7:30 PM at Sushi Yoshitake.");
    expect(answerPreview("You land at Narita on Wed, Oct 14, 2026 at 3:00 PM.")).toBe("You land at Narita on Wed, Oct 14, 2026 at 3:00 PM.");
    expect(answerPreview("Call the ryokan: 03-1234-5678.")).toBe("Your answer is ready. Tap to read it.");
    // (verify20: letters-only codes, seats, lower case)
    expect(answerPreview("Your United confirmation is ABCDEF.")).toBe("Your answer is ready. Tap to read it.");
    expect(answerPreview("You're in 12A and 12B, by the window.")).toBe("Your answer is ready. Tap to read it.");
    expect(answerPreview("The booking is under Larisa Fong.")).toBe("Your answer is ready. Tap to read it.");
    expect(answerPreview("Your NOZOMI 6 leaves Nagoya at 10:36 AM from track 16.")).toBe("Your NOZOMI 6 leaves Nagoya at 10:36 AM from track 16.");
  });
  it("an empty answer still says something", () => {
    expect(answerPreview("\n\n")).toBe("Your answer is ready.");
  });
});

describe("a phone's push address", () => {
  const good = { endpoint: "https://web.push.apple.com/QAbc123def456", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ", auth: "tBHItJI5svbpez7KI4CCXg" } };
  it("is kept as the browser gives it", () => {
    expect(parseSubscription(good)).toEqual({ endpoint: good.endpoint, p256dh: good.keys.p256dh, auth: good.keys.auth });
  });
  it("anything else is refused", () => {
    expect(parseSubscription({ ...good, endpoint: "http://web.push.apple.com/x" })).toBeNull();
    expect(parseSubscription({ ...good, endpoint: "https://evil.example/ x" })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint, keys: { p256dh: "short", auth: good.keys.auth } })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint })).toBeNull();
    expect(parseSubscription("nope")).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});
