/**
 * Anything someone gives Scout — dragged in on a Mac, pasted on an iPhone, or chosen with the paperclip — turned into
 * what Claude can read (Oct 4 2026, Ken: "User should just drag (Mac) or paste (iOS) anything and Scout should parse and
 * make sense of it: picture with text, pdf, text, etc." — learned from Maria's attachmentBlocks.ts).
 *
 * - A picture (JPEG, PNG, GIF, WebP): read as a picture. Any other picture format is said plainly as unread.
 * - A PDF, a text file, a Word document: a document Scout can cite, titled with its name, so "Sources" shows the page
 *   and the words it used — as the file they sent, never as Larisa's Guide.
 * - Anything else: never silently dropped — Scout says it couldn't open it and what it can open.
 * Nothing here is kept: the file goes with this question only.
 */
export interface Attachment { mediaType: string; data: string; name?: string }

/** The title a sent file carries, so its citations can be told from her Guide's */
export const SENT_PREFIX = "Sent with this question: ";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const isText = (a: Attachment) => /^text\//.test(a.mediaType) || a.mediaType === "application/json" || /\.(txt|md|csv|json|eml|html?)$/i.test(a.name || "");
const isPdf = (a: Attachment) => a.mediaType === "application/pdf" || /\.pdf$/i.test(a.name || "");
const isDocx = (a: Attachment) => a.mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(a.name || "");
const B64 = /^[A-Za-z0-9+/=\s]+$/;
/** About 50,000 words — far more than a booking, a menu or an email; a whole book is read in part */
const TEXT_LIMIT = 200_000;

/** Checked before anything is read: the request's own shape (the server refuses anything else) */
export function validAttachments(list: unknown): Attachment[] | null {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 6) return null;
  const out: Attachment[] = [];
  let total = 0;
  for (const a of list) {
    if (!a || typeof a !== "object" || typeof (a as any).mediaType !== "string" || typeof (a as any).data !== "string") return null;
    const data = (a as any).data as string;
    if (!B64.test(data.slice(0, 400))) return null;
    total += data.length;
    out.push({ mediaType: (a as any).mediaType.slice(0, 120), data, name: typeof (a as any).name === "string" ? (a as any).name.slice(0, 160) : undefined });
  }
  // (about 18 MB of files as sent — the request itself allows 25 MB)
  return total <= 24_000_000 ? out : null;
}

export async function attachmentBlocks(list: Attachment[]): Promise<{ blocks: any[]; notes: string[]; names: string[]; images: number }> {
  const blocks: any[] = [];
  const notes: string[] = [];
  const names: string[] = [];
  let images = 0;
  let pdfs = 0;
  for (const [i, a] of list.entries()) {
    const name = a.name || (a.mediaType.startsWith("image/") ? `picture ${i + 1}` : `file ${i + 1}`);
    names.push(name);
    const title = `${SENT_PREFIX}${name}`;
    if (a.mediaType.startsWith("image/")) {
      if (IMAGE_TYPES.includes(a.mediaType)) { blocks.push({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } }); images++; }
      else notes.push(`[COULD NOT READ: ${name} — a picture in a format Scout can't open (an iPhone HEIC photo is the usual cause). NOTHING in it was read. Say so plainly and ask for a screenshot or a JPEG or PNG; never guess what it showed.]`);
    } else if (isPdf(a)) {
      if (pdfs < 4) { blocks.push({ type: "document", title, citations: { enabled: true }, source: { type: "base64", media_type: "application/pdf", data: a.data } }); pdfs++; }
      else notes.push(`[NOT READ: ${name} — only four PDFs fit in one question. Nothing in it was read; say so, and offer to take it on its own.]`);
    } else if (isText(a) || isDocx(a)) {
      let text = "";
      try {
        if (isDocx(a)) {
          const mammoth = await import("mammoth");
          text = (await mammoth.extractRawText({ buffer: Buffer.from(a.data, "base64") })).value;
        } else {
          text = Buffer.from(a.data, "base64").toString("utf-8");
        }
      } catch { text = ""; }
      if (text.trim()) {
        blocks.push({ type: "document", title, citations: { enabled: true }, source: { type: "text", media_type: "text/plain", data: text.slice(0, TEXT_LIMIT) } });
        // (a very long one is read in part — Scout says so rather than answer as if it saw the whole thing)
        if (text.length > TEXT_LIMIT) notes.push(`[READ IN PART: ${name} — only its first ${Math.round(TEXT_LIMIT / 1000)}k characters (of ${Math.round(text.length / 1000)}k) were read. If the answer could be in the rest, say so.]`);
      } else notes.push(`[COULD NOT READ: ${name} — its words couldn't be taken out. Nothing in it was read; say so plainly and ask for a PDF or a screenshot.]`);
    } else {
      notes.push(`[COULD NOT READ: ${name} — not a kind of file Scout can open. NOTHING in it was read. Say so plainly: Scout can read pictures (including a photo of a page), PDFs, Word documents and text. Never guess what it held.]`);
    }
  }
  return { blocks, notes, names, images };
}
