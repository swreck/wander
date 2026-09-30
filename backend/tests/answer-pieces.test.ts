/**
 * Scout's answer arrives in pieces around a web search (Sep 29): "I'll check — the Raku Museum is on your
 * plan for tomorrow afternoon.Yes — Tuesdays are fine." Pure text; no database, no Claude.
 */
import { describe, it, expect } from "vitest";
import { joinAnswerPieces, withoutNarration, withoutToolMarkup } from "../src/routes/chat.js";

describe("joining Scout's answer pieces", () => {
  it("drops the before-search narration and puts a space between sentences", () => {
    const out = joinAnswerPieces(["I'll check — the Raku Museum is on your plan for tomorrow afternoon.", "Yes — Tuesdays are fine. The museum's own site lists hours of 10:00 AM to 4:30 PM."]);
    expect(out).toBe("Yes — Tuesdays are fine. The museum's own site lists hours of 10:00 AM to 4:30 PM.");
  });

  it("keeps a real answer before the search, dropping only the 'let me check' sentence", () => {
    const out = joinAnswerPieces(["Larisa's Guide has you at Kappabashi 9:00–11:30 AM but doesn't give shop hours. Let me check.", "Most shops open around 10:00 AM."]);
    expect(out).toBe("Larisa's Guide has you at Kappabashi 9:00–11:30 AM but doesn't give shop hours. Most shops open around 10:00 AM.");
  });

  it("never splits a sentence that was cut by a citation", () => {
    // Citations split text mid-sentence: no space is added unless a sentence ended
    expect(joinAnswerPieces(["The museum is open ", "10:00 AM to 5:00 PM", " (last admission 4:00 PM)."])).toBe("The museum is open 10:00 AM to 5:00 PM (last admission 4:00 PM).");
    expect(joinAnswerPieces(["Hours are 10:00–4:30", ", closed Mondays."])).toBe("Hours are 10:00–4:30, closed Mondays.");
  });

  it("leaves answers without narration exactly as they were", () => {
    const a = "Dinner tonight is Hassun at 6:00 PM — a 5-minute walk from Shiraume.";
    expect(withoutNarration(a)).toBe(a);
    // "check" in ordinary use is not narration
    expect(withoutNarration("Worth a quick check with Larisa. Check out is by noon.")).toBe("Worth a quick check with Larisa. Check out is by noon.");
  });

  it("drops a false start corrected mid-sentence ('Fri… rather,')", () => {
    expect(withoutNarration("Tomorrow morning — Fri… rather, the Imperial is your last night tonight; everyone checks out Sun, Oct 18."))
      .toBe("Tomorrow morning — the Imperial is your last night tonight; everyone checks out Sun, Oct 18.");
    // An ordinary ellipsis stays
    expect(withoutNarration("Her note says \"1 day to Shigaraki…\" and nothing more.")).toBe("Her note says \"1 day to Shigaraki…\" and nothing more.");
  });

  it("drops 'Let me look that up:' and 'I'll search for that.' at a sentence start", () => {
    expect(withoutNarration("Let me look that up: the Raku Museum closes Mondays.")).toBe("the Raku Museum closes Mondays.");
    expect(withoutNarration("The Guide doesn't say. I'll search for that. It opens at 10:00 AM.")).toBe("The Guide doesn't say. It opens at 10:00 AM.");
  });
});

describe("tool markup written out as words (Sep 30 exam, H19)", () => {
  it("an answer that is only markup leaves nothing to show, and says so", () => {
    const leaked = `<invoke name="show_in_wander">\n<parameter name="date">2026-10-16</parameter>\n<parameter name="go">false</parameter>\n</invoke>`;
    expect(withoutToolMarkup(leaked)).toEqual({ text: "", had: true });
  });
  it("keeps the words around markup and takes the markup out", () => {
    const out = withoutToolMarkup(`Tonight 7:00 PM — take the Chiyoda Line from Hibiya.\n<invoke name="show_in_wander"><parameter name="go">false</parameter></invoke>`);
    expect(out).toEqual({ text: "Tonight 7:00 PM — take the Chiyoda Line from Hibiya.", had: true });
  });
  it("leaves an ordinary answer alone", () => {
    expect(withoutToolMarkup("Dinner is at 7:00 PM.")).toEqual({ text: "Dinner is at 7:00 PM.", had: false });
  });
});
