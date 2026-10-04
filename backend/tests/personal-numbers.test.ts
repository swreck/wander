/**
 * PEOPLE'S OWN TRAVEL NUMBERS (Oct 4 2026, Ken: "unless the info passes through the vault in a safe way, Wander should
 * not surprise people by surfacing their personal info"). Her Flight info tab holds a picture of an airline's
 * confirmation with the travelers' Known Traveler, eTicket and frequent-flyer numbers, phone and email. Invented
 * numbers throughout.
 * - The words: those numbers are left out (their labels stay); a booking's phone, email and total go with them; a
 *   hotel's phone in an ordinary picture stays; "Passport required" (no number) stays; a card still shows last four.
 * - The picture: never sent to a phone — no link in the list, none on request, and the image route refuses it; an
 *   ordinary picture still opens.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-personal-numbers";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { withoutFinancialDetails, holdsPersonalNumbers } = await import("../src/services/sources/filter.js");
const prisma = new PrismaClient();

const CONFIRMATION = [
  "Purchase confirmation",
  "Confirmation: ZZ9QQA",
  "Your purchase is complete and a receipt will be sent to: pat.example@mail.test",
  "Tue, Oct 13 — 12:00pm SFO ——— 11h 0m ——— NRT 3:00pm Wed. Oct 14",
  "Mr Pat Example",
  "Phone +1 (555) 010-0199",
  "MileagePlus QQX12345",
  "KTN 123456789",
  "eTicket number 0161234567890",
  "Sam Q Example",
  "KTN TT123ABCD",
  "eTicket number 0169876543210",
  "Total due $12,345.67",
].join("\n");
const HOTEL = "IMPERIAL HOTEL, TOKYO\nPhone: +81 3 5555 0101\nPassport required at check-in\nTotal JP¥100,000";

describe("the words", () => {
  const out = withoutFinancialDetails(CONFIRMATION);
  it("leave out each person's numbers, keeping the labels", () => {
    for (const n of ["123456789", "TT123ABCD", "QQX12345", "0161234567890", "0169876543210"]) expect(out).not.toContain(n);
    expect(out).toContain("KTN [left out by Wander]");
    expect(out).toContain("eTicket number [left out by Wander]");
    expect(out).toContain("MileagePlus [left out by Wander]");
    // (an eTicket number is not a card: never "[card ending …]")
    expect(out).not.toMatch(/card ending/);
  });
  it("leave out that booking's phone, email and total", () => {
    expect(out).not.toContain("010-0199");
    expect(out).not.toContain("pat.example@mail.test");
    expect(out).not.toContain("12,345");
    expect(out).toContain("Phone [left out by Wander]");
  });
  it("keep what people need: the flight, the confirmation code, the names", () => {
    expect(out).toContain("Confirmation: ZZ9QQA");
    expect(out).toContain("12:00pm SFO");
    expect(out).toContain("Mr Pat Example");
  });
  it("leave an ordinary picture alone: a hotel's phone, a passport rule, a price", () => {
    expect(holdsPersonalNumbers(HOTEL)).toBe(false);
    expect(withoutFinancialDetails(HOTEL)).toBe(HOTEL);
  });
  it("still show a card the safe way, and say the same twice", () => {
    expect(withoutFinancialDetails("Paid with 4111 1111 1111 1234")).toBe("Paid with [card ending 1234]");
    expect(withoutFinancialDetails(out)).toBe(out);
  });
});

describe("the picture", () => {
  let tripId = "", member = "";
  beforeAll(async () => {
    const t = await prisma.traveler.findFirst({ where: { displayName: "PNMember" } }) || await prisma.traveler.create({ data: { displayName: "PNMember" } });
    tripId = (await prisma.trip.create({ data: { name: "PN Numbers Trip", status: "archived" } })).id;
    await prisma.tripMember.create({ data: { tripId, travelerId: t.id, role: "planner" } });
    member = signToken({ code: "PNMember", displayName: "PNMember", travelerId: t.id });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
    await prisma.guideImage.create({ data: { tripId, sha256: "pn-personal", mimeType: "image/png", bytes: png, readStatus: "read", transcription: CONFIRMATION, facts: { summary: "An airline confirmation" } as any } });
    await prisma.guideImage.create({ data: { tripId, sha256: "pn-hotel", mimeType: "image/png", bytes: png, readStatus: "read", transcription: HOTEL, facts: { summary: "A hotel booking" } as any } });
    await prisma.guideSnapshot.create({ data: { tripId, sourceName: "PN.xlsx", sourceKind: "xlsx", contentHash: "pn", status: "current",
      tabs: [{ name: "Flight info", cells: [], images: [{ anchor: "A5", sha256: "pn-personal" }, { anchor: "B9", sha256: "pn-hotel" }] }] as any } });
  });
  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { name: "PN Numbers Trip" } });
    await prisma.traveler.deleteMany({ where: { displayName: "PNMember" } }).catch(() => {});
    await prisma.$disconnect();
  });
  const get = (p: string) => request(app).get(p).set("Authorization", `Bearer ${member}`);

  it("the list gives it no link; an ordinary picture keeps its link", async () => {
    const r = await get(`/api/guide/pictures/${tripId}`);
    const [personal, hotel] = r.body[0].pictures;
    expect(personal.url).toBeNull();
    expect(personal.personal).toBe(true);
    expect(hotel.url).toMatch(/^\/api\/guide\/picture\//);
  });
  it("asking for a link gives none", async () => {
    expect((await get(`/api/guide/picture-link/${tripId}/pn-personal`)).body).toEqual({ url: null, personal: true });
    expect((await get(`/api/guide/picture-link/${tripId}/pn-hotel`)).body.url).toMatch(/^\/api\/guide\/picture\//);
  });
  it("the image itself is refused, even with a signed link; the ordinary one opens", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const t = jwt.sign({ picture: `${tripId}:pn-personal` }, process.env.JWT_SECRET!, { expiresIn: "10m" });
    expect((await request(app).get(`/api/guide/picture/${tripId}/pn-personal?t=${t}`)).status).toBe(404);
    const link = (await get(`/api/guide/picture-link/${tripId}/pn-hotel`)).body.url;
    const ok = await request(app).get(link);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/image\/png/);
  });
  it("Find a word: the numbers aren't there to find", async () => {
    const r = await get(`/api/guide/words/${tripId}`);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain("123456789");
    expect(text).not.toContain("pat.example@mail.test");
  });
});
