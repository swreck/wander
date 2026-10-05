/**
 * Links in a Scout answer that Scout never saw (Oct 4 2026, Ken: Scout gave him a JR West link it had never opened, and
 * described the page behind it — "the third option is 'Reserve Lookup'" — the link was dead and the steps a guess).
 * A link counts as seen when it's anywhere in what Scout was given or found while answering: her Guide, the rail sheet,
 * a document, a file's words, a tool's result, a search result or a page it opened.
 */
const URL_RE = /https?:\/\/[^\s<>()\[\]"'`]+/g;

/** "https://example.com/a/?x=1." → "example.com/a?x=1" — the same address however it's punctuated or slashed */
export function linkKey(url: string): string {
  return url.replace(/[.,;:!?*_]+$/, "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/(?=$|[?#])/, "").toLowerCase();
}

export function linksIn(text: string): string[] {
  return [...new Set((text.match(URL_RE) || []).map((u) => u.replace(/[.,;:!?*_]+$/, "")))];
}

/** This check's own request to Scout — it names the unseen links, so it never counts as having seen them */
export const LINK_CHECK_NOTE = "(Wander) Your answer gives";

/**
 * Everything Scout was given or found, never what it wrote: the instructions, every message from the person (their
 * words, files, tool results), and from Scout's own turns only its tool calls and the search results and pages that came
 * back — not its text (a dead link it wrote last time would otherwise vouch for itself).
 */
export function seenIn(system: string, messages: { role: string; content: unknown }[], last: unknown[]): string {
  const parts = [system];
  for (const m of [...messages, { role: "assistant", content: last }]) {
    if (m.role === "user") {
      const c = m.content;
      if (typeof c === "string") { if (!c.startsWith(LINK_CHECK_NOTE)) parts.push(c); continue; }
      if (Array.isArray(c)) parts.push(JSON.stringify(c.filter((b: any) => !(b?.type === "text" && String(b.text || "").startsWith(LINK_CHECK_NOTE)))));
    } else if (Array.isArray(m.content)) {
      parts.push(JSON.stringify(m.content.filter((b: any) => b?.type !== "text")));
    }
  }
  return parts.join("\n");
}

/** The answer's links that appear nowhere in `seen` (everything Scout was given or found) */
export function unseenLinks(answer: string, seen: string): string[] {
  const known = new Set(linksIn(seen).map(linkKey));
  return linksIn(answer).filter((u) => !known.has(linkKey(u)));
}

/** Said plainly beside a link Wander couldn't check, when Scout kept one it never saw */
export function markUnseen(answer: string, unseen: string[]): string {
  let out = answer;
  for (const u of unseen) out = out.split(u).join(`${u} (Wander couldn't check this link — Scout didn't open it)`);
  return out;
}
