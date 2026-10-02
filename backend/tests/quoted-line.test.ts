/**
 * An exact quote of her words that Scout left uncited gets the one line holding it — labelled as Wander's match,
 * never as Scout's citation (round 15: asked "where in my sheet is the Shigaraki van time?", Scout quoted
 * "08:00 · Depart Four Seasons by private van" without pointing to it, so Sources couldn't open the spot).
 * Synthetic data; no database, no API.
 */
import { describe, it, expect } from "vitest";
import { answerSources, quotedLine, type CitedDocument } from "../src/services/guide/answerSources.js";

const van = { type: "guide" as const, label: "Her Kyoto Wed, 1028 Shigaraki tab", cells: [{ kind: "cell" as const, tab: "Kyoto Wed, 1028 Shigaraki", a1: "B51", text: "Depart Four Seasons by private van" }] };
const stop = { type: "guide" as const, label: "Her Kyoto Wed, 1028 Shigaraki tab", cells: [{ kind: "cell" as const, tab: "Kyoto Wed, 1028 Shigaraki", a1: "A42", text: "🚐 Stop 1: Four Seasons Hotel Kyoto (Private van departure)" }] };
const guide: CitedDocument = {
  title: "Larisa's Guide",
  lines: [
    { text: "THE GUIDE'S OTHER TABS", src: null },
    { text: "08:00 · Depart Four Seasons by private van", src: van },
    { text: "🚐 Stop 1: Four Seasons Hotel\n     Kyoto (Private van departure)", src: stop },
    { text: "Dinner at Shiraume — Japanese kaiseki", src: { type: "guide", label: "Kyoto Sun", cells: [{ kind: "cell", tab: "Kyoto Sun", a1: "B54", text: "Dinner at Shiraume — Japanese kaiseki" }] } },
    { text: "Dinner at Shiraume — Japanese kaiseki (the Itinerary's copy)", src: { type: "guide", label: "Itinerary", cells: [{ kind: "cell", tab: "Itinerary", a1: "F62", text: "x" }] } },
  ],
};

describe("an uncited exact quote of her words", () => {
  it("finds the one line holding it, word for word", () => {
    expect(quotedLine("It's in your Shigaraki tab: \"08:00 · Depart Four Seasons by private van\" — the first line.", [guide])).toEqual(van);
  });

  it("reads across her line breaks and curly quotes", () => {
    expect(quotedLine("The stop list says “Stop 1: Four Seasons Hotel Kyoto (Private van departure)”.", [guide])).toEqual(stop);
  });

  it("words in two lines with different sources: no match — never a guess", () => {
    expect(quotedLine("She wrote \"Dinner at Shiraume — Japanese kaiseki\".", [guide])).toBeNull();
  });

  it("a short quote (under 15 characters) or a paraphrase: no match", () => {
    expect(quotedLine("It says \"private van\" there.", [guide])).toBeNull();
    expect(quotedLine("It says \"leave the Four Seasons by van at eight\".", [guide])).toBeNull();
  });

  it("in the answer's sources: a claim marked as Wander's match, out of Scout's own words", () => {
    const shown = "It's in your Kyoto Wed, 1028 Shigaraki tab: \"08:00 · Depart Four Seasons by private van\". I think that's early.";
    const out = answerSources(shown, [{ text: shown, citations: [] }], [guide], "Japan Oct 2026-2");
    expect(out.claims).toEqual([{ said: "It's in your Kyoto Wed, 1028 Shigaraki tab: \"08:00 · Depart Four Seasons by private van\".", sources: [van], matched: true }]);
    expect(out.ownWords).toEqual(["I think that's early."]);
  });
});
