/**
 * The phrase card's Add (Ken, Oct 14): "'Add' allows add where person types or speaks English and scouts fill in the fine
 * print Japanese and pronunciation. If the translation is questionable or problematic or can be done in two ways with
 * different nuance, give an option with super brief context and tappable choice."
 *
 * One English request in, one line out — or two or three when the Japanese really splits (politeness, nuance, or an
 * English word with two meanings), each with a few words that tell them apart. Every line's title is English, what an
 * English speaker scans the card for (Ken, Oct 14). Something to recognize on a device ("the toilet's flush buttons")
 * gets the characters with their meanings and no pronunciation. Nothing is added here: the person taps a choice.
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export type PhraseOption = { kind: "say" | "recognize" | "show"; english: string; romaji: string; pronunciation: string | null; script: string | null; note: string | null; sameAs?: string | null };

const SYSTEM = `You write lines for a traveler's Japanese phrase card. The traveler is an English speaker in Japan. They give you, in English (typed, or spoken and transcribed, so it may be messy), something they want to SAY, something they want to SHOW someone (an allergy or diet, a medical need, an address for a taxi, a request best handed over in writing), or something they want to RECOGNIZE on a sign, button, screen or machine.

Reply with JSON only, no other text: {"options":[...]} or {"options":[],"why":"..."}.
Each option: {"kind":"say"|"show"|"recognize","english":"...","romaji":"...","pronunciation":"..."|null,"script":"..."|null,"note":"..."|null,"sameAs":"..."|null}

- For something to SHOW: english is a short title ("Allium allergy"); script is their message in natural, polite written Japanese (kanji and kana) as a Japanese person would write it for restaurant or shop staff, saying what they asked and nothing more (no added warnings or requests); romaji is what that Japanese says, in plain English, sentence for sentence, so the traveler knows exactly what they are handing over (every item, every request, the polite close too), never a summary or a shorter version; pronunciation null.
- script, for something to SAY: the same phrase in written Japanese when showing it would help as much as saying it (a hospital, a pharmacy, a station name); else null. Always null for something to recognize.

- sameAs: when a line already ON THE CARD (given with their request) means the same thing, its title exactly as given; else null. Different wording of the same meaning counts ("The check, please" = "Check please").

- english: the line's title, short, in English: what they'd scan the card for. Keep their own wording when it already makes a good title (fix only obvious dictation slips). For something to recognize, what it's for ("Toilet flush", "Ticket machine fares").
- romaji, for something to say: natural Japanese a traveler would use with staff or strangers, in Hepburn romaji (long vowels as "ou"/"uu" or plain, never macrons unless they gave them). NEVER Japanese characters.
- pronunciation, for something to say: the romaji sounded out for an English speaker, every syllable written out (even ones said softly: "tsukaemasu" → "tsoo-kah-eh-mahs", never "tskah"), syllables joined by hyphens, each word capitalized only at the start of a sentence, keeping the romaji's punctuation, as on the card: "Konnichiwa" → "Koh-nee-chee-wah"; "Arigatou gozaimasu" → "Ah-ree-gah-toh go-zah-ee-mahs"; "Ikura desu ka?" → "Ee-koo-rah dess kah?"; "Sumimasen" → "Sue-mee-mah-sen".
- For something to recognize: romaji is only the characters with what each means, short ("大 = full flush; 小 = light flush"), pronunciation null. Never a rule of thumb or advice ("red curtain is usually women"): signs vary, and a wrong guess sends someone the wrong way.
- Never add a fact they didn't give: no street address, phone number, opening hours or name they didn't supply (for "take me to the Imperial Hotel", the hotel's name in Japanese, not an address from memory; a small inn's address from memory could send a taxi to the wrong place).
- No em dashes anywhere; plain short words.
- note: null when there is one option. When there are two or three, at most 6 words each telling them apart ("polite, to staff" / "casual, to a friend"; "the bill at a restaurant" / "checking in at a hotel").

Give ONE option when one natural phrase serves. Give two, at most three, only when the Japanese really differs in nuance or politeness in a way that matters to a traveler, or the English could mean two different things. If they ask for something that isn't a phrase or that you can't put honestly into Japanese, return no options and say why in a few plain words.`;

const JAPANESE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
// (no em dashes on the card, whatever the model writes: one between words becomes a comma — verify54)
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");

/** The options for one request, checked; or why there are none */
export async function suggestPhrase(asked: string, onCard: { english: string; local: string }[] = []): Promise<{ options: PhraseOption[]; why?: string }> {
  // (the card's lines, so a request meaning one already there says so: "The check, please" beside "Check please")
  const card = onCard.length ? `\n\nON THE CARD: ${onCard.map((p) => `"${p.english}" (${p.local})`).join(" · ")}` : "";
  const r = await anthropic.messages.create({
    model: "claude-opus-5",
    // (room for its thinking as well as the answer: at 800, "I'm allergic to shellfish" thought for ~700 and the answer
    // was cut off, every time — verify53)
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: `${asked.slice(0, 400)}${card}` }],
  });
  const text = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: any;
  try { parsed = JSON.parse(json); } catch {
    console.warn(`[phrase-suggest] unreadable reply (stop ${r.stop_reason}, ${r.usage?.output_tokens} tokens): ${text.slice(0, 300)}`);
    return { options: [], why: "I couldn't put that into Japanese. Try saying it another way?" };
  }
  return { options: checkedOptions(parsed?.options), ...(typeof parsed?.why === "string" ? { why: clip(parsed.why, 200) } : {}) };
}

/** Only well-formed options: a phrase to say never carries Japanese characters and always its pronunciation; one to
 *  recognize always carries them. At most three; a note only when there's a choice. */
export function checkedOptions(raw: unknown): PhraseOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PhraseOption[] = [];
  for (const o of raw.slice(0, 3)) {
    const kind = o?.kind === "recognize" ? "recognize" : o?.kind === "show" ? "show" : "say";
    // (room for a show line's whole English: cut at 200, the allium card's would lose its last sentence — verify56)
    const english = clip(o?.english, 120), romaji = clip(o?.romaji, 600), pronunciation = clip(o?.pronunciation, 300);
    // (Japanese writing as written: commas and dashes inside it are left alone)
    const script = typeof o?.script === "string" && JAPANESE.test(o.script) ? o.script.trim().slice(0, 600) : "";
    if (!english || !romaji) continue;
    if (kind === "say" && (JAPANESE.test(romaji) || JAPANESE.test(pronunciation) || !pronunciation)) continue;
    if (kind === "recognize" && !JAPANESE.test(romaji)) continue;
    // (something to show is an English message with its Japanese: no Japanese, nothing to show)
    if (kind === "show" && (JAPANESE.test(romaji) || !script)) continue;
    out.push({ kind, english, romaji, pronunciation: kind === "say" ? pronunciation : null, script: kind === "recognize" ? null : script || null,
      note: clip(o?.note, 60) || null, sameAs: clip(o?.sameAs, 120) || null });
  }
  if (out.length === 1) out[0].note = null;
  return out;
}
