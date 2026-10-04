/**
 * Anything given to Scout — dragged in, pasted or chosen: pictures, PDFs, Word documents and text become what Claude
 * reads; anything else is said plainly as unread, never dropped; citations to a sent file show as that file, never as
 * her Guide. Synthetic files; no database, no API.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { validAttachments, attachmentBlocks, SENT_PREFIX } from "../src/services/attachments.js";
import { resolveCitation } from "../src/services/guide/answerSources.js";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PDF = b64("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function docx(text: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");
}

describe("what the server accepts", () => {
  it("no attachments is fine", () => {
    expect(validAttachments(undefined)).toEqual([]);
    expect(validAttachments(null)).toEqual([]);
  });
  it("a well-formed list passes, names trimmed to a sane length", () => {
    const out = validAttachments([{ mediaType: "application/pdf", data: PDF, name: "x".repeat(500) }]);
    expect(out).toHaveLength(1);
    expect(out![0].name).toHaveLength(160);
  });
  it("refuses more than six, a non-list, a missing field, or data that isn't base64", () => {
    expect(validAttachments(Array(7).fill({ mediaType: "text/plain", data: b64("a") }))).toBeNull();
    expect(validAttachments({ mediaType: "text/plain", data: "a" })).toBeNull();
    expect(validAttachments([{ mediaType: "text/plain" }])).toBeNull();
    expect(validAttachments([{ mediaType: "text/plain", data: "<script>alert(1)</script>" }])).toBeNull();
  });
  it("refuses more than about 18 MB of files altogether", () => {
    const big = "A".repeat(12_100_000);
    expect(validAttachments([{ mediaType: "application/pdf", data: big }, { mediaType: "application/pdf", data: big }])).toBeNull();
  });
});

describe("what Scout reads", () => {
  it("a picture is a picture; a PDF is a cited document titled with its name", async () => {
    const r = await attachmentBlocks([
      { mediaType: "image/png", data: PNG, name: "Menu.png" },
      { mediaType: "application/pdf", data: PDF, name: "Booking.pdf" },
    ]);
    expect(r.images).toBe(1);
    expect(r.blocks[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    expect(r.blocks[1]).toMatchObject({ type: "document", title: `${SENT_PREFIX}Booking.pdf`, citations: { enabled: true }, source: { media_type: "application/pdf" } });
    expect(r.notes).toEqual([]);
  });
  it("a PDF with no type but a .pdf name is still a PDF (some browsers send none)", async () => {
    const r = await attachmentBlocks([{ mediaType: "", data: PDF, name: "Ryokan.PDF" }]);
    expect(r.blocks[0].source.media_type).toBe("application/pdf");
  });
  it("a text file's words are read as they are", async () => {
    const r = await attachmentBlocks([{ mediaType: "text/plain", data: b64("Check-in 15:00 at Hiiragiya"), name: "email.txt" }]);
    expect(r.blocks[0]).toMatchObject({ type: "document", source: { type: "text", data: "Check-in 15:00 at Hiiragiya" } });
  });
  it("a Word document's words are taken out and read", async () => {
    const r = await attachmentBlocks([{ mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: await docx("Dinner at Kikunoi, 6 PM"), name: "plan.docx" }]);
    expect(r.blocks[0].source.data).toContain("Dinner at Kikunoi, 6 PM");
    expect(r.notes).toEqual([]);
  });
  it("a broken Word document is said plainly as unread, never guessed at", async () => {
    const r = await attachmentBlocks([{ mediaType: "", data: b64("not a zip"), name: "broken.docx" }]);
    expect(r.blocks).toEqual([]);
    expect(r.notes[0]).toMatch(/COULD NOT READ: broken\.docx/);
  });
  it("an iPhone HEIC picture and an unknown file are named as unread", async () => {
    const r = await attachmentBlocks([
      { mediaType: "image/heic", data: PNG, name: "IMG_1.HEIC" },
      { mediaType: "application/zip", data: b64("zip"), name: "photos.zip" },
    ]);
    expect(r.blocks).toEqual([]);
    expect(r.notes).toHaveLength(2);
    expect(r.notes[0]).toMatch(/IMG_1\.HEIC.*never guess/);
    expect(r.notes[1]).toMatch(/photos\.zip.*Never guess/);
    expect(r.names).toEqual(["IMG_1.HEIC", "photos.zip"]);
  });
  it("only four PDFs in one question; the fifth is named as unread", async () => {
    const r = await attachmentBlocks(Array.from({ length: 5 }, (_, i) => ({ mediaType: "application/pdf", data: PDF, name: `p${i}.pdf` })));
    expect(r.blocks).toHaveLength(4);
    expect(r.notes[0]).toMatch(/NOT READ: p4\.pdf/);
  });
  it("a very long text is read in part, and Scout is told so", async () => {
    const r = await attachmentBlocks([{ mediaType: "text/plain", data: b64("word ".repeat(60_000)), name: "book.txt" }]);
    expect(r.blocks[0].source.data.length).toBe(200_000);
    expect(r.notes[0]).toMatch(/READ IN PART: book\.txt/);
  });
  it("an unnamed pasted picture is called a picture by its place", async () => {
    const r = await attachmentBlocks([{ mediaType: "image/jpeg", data: PNG }]);
    expect(r.names).toEqual(["picture 1"]);
  });
});

describe("a citation to a sent file", () => {
  it("shows as the file they sent, with its page — never as her Guide", () => {
    const got = resolveCitation({ type: "page_location", document_index: 1, document_title: `${SENT_PREFIX}Backroads.pdf`, start_page_number: 3, end_page_number: 4, cited_text: "Day 3: Kurokawa Onsen" }, []);
    expect(got).toEqual([{ type: "document", document: "Backroads.pdf", from: "the file you sent", version: "sent with the question — Wander doesn't keep it", place: "page 3", quote: "Day 3: Kurokawa Onsen" }]);
  });
  it("a span of pages shows as one range", () => {
    const [v] = resolveCitation({ type: "page_location", document_title: `${SENT_PREFIX}a.pdf`, start_page_number: 2, end_page_number: 5, cited_text: "x" }, []) as any[];
    expect(v.place).toBe("page 2–4");
  });
  it("a text file's citation has no page", () => {
    const [v] = resolveCitation({ type: "char_location", document_title: `${SENT_PREFIX}email.txt`, cited_text: "Check-in 15:00" }, []) as any[];
    expect(v.place).toBe("");
  });
});
