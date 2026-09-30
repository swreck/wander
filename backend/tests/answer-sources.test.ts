/**
 * Scout's "Sources": each cited piece of an answer resolves to the source recorded with the line it cites;
 * uncited parts are Scout's own words; a time not in the cited words is flagged, never vouched for. The
 * citation shapes are the API's own (seen in a live probe, Sep 30 2026). Synthetic data; no database, no API.
 */
import { describe, it, expect } from "vitest";
import { piecesOfStep, resolveCitation, answerSources, minutesIn, timesNotInSources, excerptFor, type CitedDocument } from "../src/services/guide/answerSources.js";

const guide: CitedDocument = {
  title: "Larisa's Guide",
  lines: [
    { text: "Tuesday, October 27 (2026-10-27) — Kyoto", src: { type: "wander", what: "Which city Wander files this day under, from her Itinerary", from: [] } },
    { text: "  - 12:30–13:30 block: Test lunch — Choice: Omen — udon near Ginkaku-ji (source: Kyoto Tue · Day 3)",
      src: { type: "guide", label: "Kyoto Tue · Day 3", cells: [{ kind: "cell", tab: "Kyoto Tue", a1: "B20", text: "Test lunch" }] } },
    { text: "  - 18:30 meal: Ristorante Dono (source: Dining Resos (row 22))",
      src: { type: "guide", label: "Dining Resos (row 22)", cells: [{ kind: "cell", tab: "Dining Resos", a1: "C22", text: "Ristorante DONO" }] } },
  ],
};
const loc = (start: number, end: number, cited: string) => ({ type: "content_block_location", document_index: 0, document_title: "Larisa's Guide", start_block_index: start, end_block_index: end, cited_text: cited });

describe("pieces of an answer", () => {
  it("pieces side by side join as written; a tool call starts a new group", () => {
    const { groups, pieces } = piecesOfStep([
      { type: "text", text: "Dinner is " },
      { type: "text", text: "6:30 PM at Ristorante Dono", citations: [loc(2, 3, "18:30 meal: Ristorante Dono")] },
      { type: "text", text: "." },
      { type: "tool_use", name: "show_in_wander" },
      { type: "text", text: "Here it is." },
    ]);
    expect(groups).toEqual(["Dinner is 6:30 PM at Ristorante Dono.", "Here it is."]);
    expect(pieces[1].citations).toHaveLength(1);
  });
});

describe("resolving a citation to the source recorded with its line", () => {
  it("a Guide line: her cell and words", () => {
    expect(resolveCitation(loc(2, 3, "x"), [guide])).toEqual([guide.lines[2].src]);
  });
  it("a citation spanning lines gives each line's source", () => {
    expect(resolveCitation(loc(0, 2, "x"), [guide])).toHaveLength(2);
  });
  it("a web page: its title, full address and the quoted words", () => {
    expect(resolveCitation({ type: "web_search_result_location", url: "https://example.com/omen", title: "Omen Udon", cited_text: "closed Thursday" }, [guide]))
      .toEqual([{ type: "web", title: "Omen Udon", url: "https://example.com/omen", quote: "closed Thursday" }]);
  });
  it("a citation to a document Wander didn't send resolves to nothing — never to a nearby line", () => {
    expect(resolveCitation({ ...loc(1, 2, "x"), document_title: "Something else" }, [guide])).toEqual([]);
  });
});

describe("times", () => {
  it("reads 12-hour, 24-hour and bare times", () => {
    expect(minutesIn("6:30 PM").map((t) => t.minutes)).toEqual([[1110]]);
    expect(minutesIn("18:30").map((t) => t.minutes)).toEqual([[1110]]);
    expect(minutesIn("1:30").map((t) => t.minutes)).toEqual([[90, 810]]);
    expect(minutesIn("3:45p").map((t) => t.minutes)).toEqual([[945]]);
    expect(minutesIn("party of 2 adults")).toEqual([]);
  });
  it("a time Scout said that isn't in what it cited is flagged", () => {
    expect(timesNotInSources("Dinner is 6:30 PM", ["18:30 meal: Ristorante Dono"])).toEqual([]);
    expect(timesNotInSources("Leave the hotel at 5:15 PM", ["18:30 meal: Ristorante Dono"])).toEqual(["5:15 PM"]);
  });
});

describe("an answer's sources", () => {
  const pieces = [
    { text: "**Dinner, Oct 27:** ", citations: [] },
    { text: "6:30 PM at Ristorante Dono", citations: [loc(2, 3, "18:30 meal: Ristorante Dono")] },
    { text: ". Either way, Thursday is the closing day and lunch is open through mid-afternoon. At lunch, ", citations: [] },
    { text: "waits of 25 people are common", citations: [{ type: "web_search_result_location", url: "https://t.example/omen", title: "Omen reviews", cited_text: "a line of about 25 people" }] },
    { text: ". ", citations: [] },
    { text: "Leave at 5:15 PM for Dono", citations: [loc(2, 3, "18:30 meal: Ristorante Dono")] },
    { text: ".", citations: [] },
  ];
  const shown = pieces.map((p) => p.text).join("");
  const result = answerSources(shown, pieces, [guide], "Japan Oct 2026-2");

  it("each cited piece with what it cites", () => {
    expect(result.claims.map((c) => c.said)).toEqual(["6:30 PM at Ristorante Dono", "waits of 25 people are common", "Leave at 5:15 PM for Dono"]);
    expect(result.claims[0].sources[0]).toMatchObject({ type: "guide", label: "Dining Resos (row 22)" });
    expect(result.claims[1].sources[0]).toMatchObject({ type: "web", url: "https://t.example/omen" });
  });
  it("a cited piece whose time isn't in its source is flagged", () => {
    expect(result.claims[0].unmatchedTimes).toBeUndefined();
    expect(result.claims[2].unmatchedTimes).toEqual(["5:15 PM"]);
  });
  it("a sentence with no sourced part is Scout's own words; a bare heading isn't listed", () => {
    expect(result.ownWords).toEqual(["Either way, Thursday is the closing day and lunch is open through mid-afternoon."]);
  });
  it("the words around a sourced part of a sentence aren't listed as a fragment ('At lunch,')", () => {
    const flight = [
      { text: "You and Andy land at Narita (NRT) on ", citations: [] },
      { text: "Wednesday, Oct 14 at 3:00 PM Japan time", citations: [loc(2, 3, "15:00")] },
      { text: " — so you'll check in after landing.", citations: [] },
    ];
    expect(answerSources(flight.map((p) => p.text).join(""), flight, [guide], null).ownWords).toEqual([]);
  });
  it("a piece taken out of the answer before it's shown isn't listed", () => {
    const r = answerSources("6:30 PM at Ristorante Dono", pieces, [guide], null);
    expect(r.claims).toHaveLength(1);
    expect(r.ownWords).toEqual([]);
  });
  it("says which copy of her Guide", () => {
    expect(result.copy).toBe("Japan Oct 2026-2");
  });
});

describe("a long cell is shown by its lines that bear on the answer", () => {
  const email = [
    "Four Seasons - 2bd Residence Saturday, April 11, 2026 9:13 AM",
    "From: the hotel's reservations desk",
    "Arrival: Tuesday, October 27, 2026 · Departure: Thursday, October 29, 2026",
    "Room: Two-Bedroom Heritage Garden Residence, One king and two double beds",
    "All cancellations must be received by 3:00 pm Kyoto time at least 24 hours prior to expected arrival date, or a penalty equal to one night's room rate, plus tax and service fee, will be charged.",
    "We look forward to welcoming you.",
  ].join("\n");

  it("keeps her words, marks it as part of the cell", () => {
    const x = excerptFor(email, "the penalty after that is one night's room rate plus tax and service fee");
    expect(x.part).toBe(true);
    expect(x.text).toContain("penalty equal to one night's room rate");
    expect(x.text).not.toContain("We look forward");
    expect(email).toContain(x.text.split("\n")[0]); // her words, unedited
  });

  it("a short cell is shown whole", () => {
    expect(excerptFor("Tu, 10/27 @ 6:30p", "dinner at 6:30")).toEqual({ text: "Tu, 10/27 @ 6:30p", part: false });
  });
});
