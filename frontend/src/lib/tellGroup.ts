/**
 * "Tell the group" on a maybe (moved out of IdeasPage so a test reaches it; S2c, Nov 17 2026): the iPhone's share sheet with a
 * maybe's words, link and city, for the group text (and Julie, who isn't on Wander); with no share sheet, copied. Words that
 * carry a sample's marker are never shared or copied: nothing happens.
 */
import { noSampleText } from "./samples";

/** One person, however they're named: "Larisa (maybe)", "Julie (via Andy)", "Andy B" → "Larisa", "Julie", "Andy" */
export const personOf = (n: string) => n.replace(/\s*\((maybe|via [^)]*)\)\s*$/i, "").trim().split(/\s+/)[0] || n;

/**
 * Returns a line to show, or null. On every maybe, not only just after Send — Ken, Oct 3: the button was gone by the time he
 * looked for it, and someone else's maybe couldn't be passed on.
 */
export async function tellGroup(by: string, words: string, link: string | null, cityName: string, fromGuide?: string): Promise<string | null> {
  // (one of her ideas carries its source: "From Larisa's Guide: …" — Ken, Oct 3: "any item, with the original source")
  const body = noSampleText(`${fromGuide ? `From ${fromGuide}: ` : `${personOf(by)}: `}${words}${link ? `\n${link}` : ""}\n(on Wander's maybes for ${cityName})`);
  if (body === null) return null;
  try {
    if (typeof navigator.share === "function") { await navigator.share({ text: body }); return null; }
    await navigator.clipboard.writeText(body);
    return "Copied — paste it into your group text.";
  } catch (e) {
    // (closing the share sheet isn't a failure)
    return (e as { name?: string })?.name === "AbortError" ? null : "Couldn't open sharing here — copy the words from the list instead.";
  }
}
