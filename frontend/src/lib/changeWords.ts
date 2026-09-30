/**
 * A change someone made, in plain words: "Andy added Musée Tomo to Tokyo".
 *
 * Stored descriptions often already start with the person's name and end with "(via chat)";
 * shown after the name they read "Andy Andy added … (via chat)". This keeps one name, drops the
 * software aside, keeps capitals (Tokyo, not tokyo), and shortens on a word boundary.
 */
export function changeWords(name: string, description: string | null | undefined, max = 80): string {
  let d = (description || "").trim();
  if (!d) return `${name} made a change`;
  d = d.replace(/\s*\((via chat|via Scout)\)\s*$/i, "").trim();
  // Older entries carry raw dates ("to 2026-10-16"); people read "to Fri, Oct 16"
  d = d.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo, da) =>
    new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da))).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }));
  const lower = d.toLowerCase();
  const n = name.trim().toLowerCase();
  if (n && (lower.startsWith(`${n} `) || lower === n)) d = d.slice(name.trim().length).trim();
  let text = `${name} ${d}`;
  if (text.length > max) {
    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(" ");
    text = `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:(\-–—"“]+$/, "")}…`;
  }
  // A quote or bracket opened but cut off before it closed reads broken — close it
  const quotes = (text.match(/"/g) || []).length;
  if (quotes % 2 === 1) text = text.replace(/…$/, "…\"");
  return text;
}

/** The same words without the leading name, for lists that show the name in bold beside it. */
export function changeRest(name: string, description: string | null | undefined, max = 200): string {
  return changeWords(name, description, max).slice(name.length).trim();
}
