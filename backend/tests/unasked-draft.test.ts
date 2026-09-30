/**
 * Scout adds a "Message for Larisa:" draft (which the app turns into a Send button) only when someone
 * asked for it. Sep 29: "what time should we leave for the airport?" ended in a draft nobody asked for.
 * (Pure logic; no database.)
 */
import { describe, it, expect } from "vitest";
import { withoutUnaskedDraft } from "../src/routes/chat.js";

const answer = "Her two tabs give different Haruka times.";
const draft = "\n\nMessage for Larisa: Which Haruka matches the reserved seats — 12:30 or 1:30?";

describe("Message for Larisa only when asked", () => {
  it("takes the draft off a plain question", () => {
    expect(withoutUnaskedDraft(answer + draft, "what time should we leave for the airport?", [], "Ken")).toBe(answer);
  });

  it("keeps it when they ask for her to be told", () => {
    for (const q of ["can you text Larisa that we're skipping Nishiki?", "let Larisa know we picked Omen", "draft a note about the Haruka"]) {
      expect(withoutUnaskedDraft(answer + draft, q, [], "Ken")).toBe(answer + draft);
    }
  });

  it("keeps it when they say yes to Scout's own offer", () => {
    // The shape the app sends (ChatBubble): { role, text }
    const history = [{ role: "user", text: "which haruka?" }, { role: "assistant", text: "Want me to draft a note to Larisa asking?" }];
    expect(withoutUnaskedDraft(answer + draft, "yes please", history, "Andy")).toBe(answer + draft);
  });

  it("a yes to something else isn't a yes to a draft", () => {
    const history = [{ role: "assistant", text: "Want me to open Oct 29?" }];
    expect(withoutUnaskedDraft(answer + draft, "yes", history, "Ken")).toBe(answer);
  });

  it("never drafts a message to Larisa for Larisa", () => {
    expect(withoutUnaskedDraft(answer + draft, "text Larisa about it", [], "Larisa")).toBe(answer);
  });

  it("leaves replies without a draft untouched", () => {
    expect(withoutUnaskedDraft(answer, "when is dinner?", [], "Ken")).toBe(answer);
  });

  it("takes off a bold-labelled draft too", () => {
    expect(withoutUnaskedDraft(`${answer}\n\n**Message for Larisa:** Which Haruka?`, "when do we leave?", [], "Julie")).toBe(answer);
  });
});
