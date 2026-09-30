/**
 * "Tell Larisa": Wander never writes to her Guide, so anything added here that she should know
 * about goes to her the way people already talk — a message from this phone, already written.
 * Works for any trip's Guide ("From Larisa's Guide · …" names whose it is).
 */

/** Whose Guide this trip is read from, from its tagline ("From Larisa's Guide · Japan Oct 2026"). */
export function guideOwnerOf(tagline: string | null | undefined): string | null {
  const m = (tagline || "").match(/From\s+([\p{L}][\p{L}' -]{0,30}?)'s Guide/u);
  return m ? m[1].trim() : null;
}

/** Opens the phone's share sheet (Messages) with the text; copies it if sharing isn't possible. */
export async function sendToGuideOwner(owner: string, text: string): Promise<string | null> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return null;
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return null;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return `Copied — paste it into a message to ${owner}.`;
  } catch {
    return "This phone didn't let Wander copy the message.";
  }
}

const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** The message for a plan added in Wander: "Larisa — Ken & Andy: Musée Tomo at 3 PM, Fri, Oct 16 (added in Wander)." */
export function planMessage(owner: string, plan: { text: string; date: string; time?: string | null; addedBy: string }, me: string | null) {
  // Reads like a person wrote it: "Hi Larisa — today around 2:30 PM: Musée Tomo with Andy. …"
  const d = new Date();
  const todayYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const t = new Date(d.getTime() + 86400000);
  const tomorrowYmd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const dayWords = plan.date === todayYmd ? "today" : plan.date === tomorrowYmd ? "tomorrow" : `on ${day(plan.date)}`;
  const when = `${dayWords}${plan.time ? ` around ${clockWords(plan.time)}` : ""}`;
  const who = me && plan.addedBy === me ? "" : ` (${plan.addedBy} put it in)`;
  return `Hi ${owner} — ${when}: ${plan.text}${who}. It's in Wander for everyone; your Guide is just as you left it.`;
}

function clockWords(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}
