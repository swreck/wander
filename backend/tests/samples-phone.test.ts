/**
 * S2c C8-C11 (Nov 17 2026): samples on the phone. Read straight from the phone's own files, as day-zone-phone.test.ts does:
 * nothing with a sample's id leaves the phone (never fetched, never queued), nothing a sample holds is kept in a copy, the
 * merge changes nothing when there are no samples, and words that carry the marker are never shared or copied.
 * Invented trip and people. No network: fetch is a stand-in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const queued = vi.hoisted(() => vi.fn());
vi.mock("../../frontend/src/lib/offlineStore.ts", async (orig) => ({ ...(await orig<any>()), queueRequest: queued, getQueueCount: async () => 0 }));

// A phone's storage, for the libs that keep a copy
const store = new Map<string, string>();
const fakeStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
(globalThis as any).localStorage = fakeStorage;
// (a phone's window and document, as far as these libs touch them)
(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true };
(globalThis as any).document = { addEventListener() {}, visibilityState: "visible" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=+$/, "");
const TOKEN = `h.${b64({ travelerId: "traveler-ken", code: "Ken" })}.s`;
const OTHER = `h.${b64({ travelerId: "traveler-sam", code: "Sam" })}.s`;
const nav = (o: Record<string, unknown> = {}) => vi.stubGlobal("navigator", { onLine: true, share: vi.fn(async () => {}), clipboard: { writeText: vi.fn(async () => {}) }, ...o });

const M = "⁣⁣";
const TRIP = "trip-1";
const rows = [
  { id: "sample:a1", kind: "line", date: "2026-12-17", slot: "2026-12-17|morning", data: { title: `Slow morning${M}`, time: `10:30${M}`, picture: true } },
  { id: "sample:a2", kind: "line", date: "2026-12-18", slot: "2026-12-18|evening", data: { title: `Dinner${M}`, time: `19:00${M}` } },
  { id: "sample:b1", kind: "unconfirmed", date: "2026-12-17", slot: "leg:x", data: { title: `A flight${M}`, time: `07:25${M}`, timeZone: "Asia/Seoul", tag: `Not confirmed${M}`, from: `Ken's notes${M}` } },
  { id: "sample:c1", kind: "summary", date: "2026-12-17", slot: "2026-12-17|summary", data: { text: `A quiet day${M}` } },
  { id: "sample:d1", kind: "maybe", date: null, slot: "city-a|1", data: { title: `The market${M}` } },
  { id: "sample:d2", kind: "maybe", date: null, slot: "city-b|1", data: { title: `The temple${M}` } },
  { id: "sample:e1", kind: "note", date: "2026-12-17", slot: "2026-12-17|note", data: { text: `A thought${M}` } },
  { id: "sample:f1", kind: "trip_photo", date: "2026-12-17", slot: "2026-12-17|photo", data: { caption: `A view${M}` } },
];

let fetched: string[] = [];
let network: "up" | "down" = "up";
const answer = (url: string): unknown => {
  if (url.startsWith("/api/samples/")) return rows;
  if (url === `/api/trips/${TRIP}`) return { id: TRIP, name: "A trip", cities: [], days: [] };
  if (url.startsWith("/api/days/trip/") || url.startsWith("/api/guide/items/") || url.startsWith("/api/accommodations/trip/")) return [];
  if (url.startsWith("/api/guide/status/")) return { current: null };
  if (url.startsWith("/api/guide/day-summaries/")) return { byDay: { "2026-12-19": "A real summary." } };
  if (url.startsWith("/api/expenses/trip/")) return { couples: [], totals: {}, payments: [] };
  if (url.startsWith("/api/trip-photos/trip/")) return { photos: [], shareDefault: false };
  return {};
};
const fetchSpy = vi.fn(async (url: any) => {
  fetched.push(String(url));
  if (network === "down") throw new TypeError("Failed to fetch");
  return new Response(JSON.stringify(answer(String(url))), { status: 200, headers: { "content-type": "application/json" } });
});
(globalThis as any).fetch = fetchSpy;

const { api, namesASample } = await import("../../frontend/src/lib/api.ts");
const S = await import("../../frontend/src/lib/samples.ts");
const { loadSamples, forgetSamples, mergeSamples, sampleFor, noSampleText, withoutMarker, SAMPLE_MARKER } = S;

beforeEach(async () => {
  store.clear(); store.set("wander_token", TOKEN); network = "up"; nav(); forgetSamples();
  await api.post("/forget-what-was-just-read", {});   // (any save makes api.ts forget the reads it shared a moment ago)
  fetched = []; fetchSpy.mockClear(); queued.mockClear();
});

// The requests of C7, as the phone makes them
const T = "trip-1";
const requests: [string, () => Promise<unknown>][] = [
  ["POST /maybes/sample:x/in", () => api.post("/maybes/sample:x/in", {})],
  ["DELETE /maybes/sample:x", () => api.delete("/maybes/sample:x")],
  ["POST /maybes/sample:x/back", () => api.post("/maybes/sample:x/back", {})],
  ["POST /experience-notes {experienceId}", () => api.post("/experience-notes", { experienceId: "sample:x", text: "hi" })],
  ["POST /day-choices/:tripId {experienceId}", () => api.post(`/day-choices/${T}`, { experienceId: "sample:x" })],
  ["DELETE /day-choices/:tripId/sample:x", () => api.delete(`/day-choices/${T}/sample:x`)],
  ["PATCH /trip-notes/sample:x", () => api.patch("/trip-notes/sample:x", { text: "x" })],
  ["DELETE /trip-notes/sample:x", () => api.delete("/trip-notes/sample:x")],
  ["PATCH /expenses/trip/:tripId/sample:x", () => api.patch(`/expenses/trip/${T}/sample:x`, { amount: 1 })],
  ["DELETE /expenses/trip/:tripId/sample:x", () => api.delete(`/expenses/trip/${T}/sample:x`)],
  ["PATCH /trip-photos/sample:x", () => api.patch("/trip-photos/sample:x", { shared: true })],
  ["DELETE /trip-photos/sample:x", () => api.delete("/trip-photos/sample:x")],
  ["PATCH /experiences/sample:x", () => api.patch("/experiences/sample:x", { name: "x" })],
  ["a saved-for-later POST of a sample's id (postRepeatable)", () => api.postRepeatable("/maybes", { tripId: T, cityId: "c", experienceId: "sample:x" })],
  ["an id deep in the body, in a list", () => api.post("/trip-notes/trip/" + T, { a: { b: [{ noteIds: ["sample:x"] }] } })],
  ["an upload to a sample's address", () => api.upload("/papers/sample:x", new Map() as any)],
];

describe("C8 nothing with a sample's id leaves the phone", () => {
  for (const mode of ["up", "down"] as const) {
    for (const [name, send] of requests) {
      it(`${name}, network ${mode}: throws before fetch; never queued`, async () => {
        network = mode;
        if (mode === "down") nav({ onLine: false });
        await expect(send()).rejects.toThrow("A sample. Nothing is planned here yet.");
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(queued).not.toHaveBeenCalled();
      });
    }
  }
  it("a note whose TEXT begins 'sample: ' is not an id: it goes out as today", async () => {
    await api.post("/trip-notes/trip/" + T, { clientId: "abcdefgh", text: "sample: try the pho" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  it("a read of a path with sample: in it is not a save", () => {
    expect(namesASample("/guide/items/sample:x")).toBe(true);   // (the test itself says yes; only saves are refused, a GET never asks it)
  });
  it("and with the network down, a real maybe is still kept for later (the queue is not broken)", async () => {
    network = "down";
    await api.post("/maybes", { tripId: T, cityId: "city", words: "the market" });
    expect(queued).toHaveBeenCalledTimes(1);
  });
});

describe("C9 mergeSamples and sampleFor", () => {
  const real = [{ id: "r1", n: 1 }, { id: "r2", n: 2 }];
  const all = rows as any[];
  it("no samples: the SAME array comes back", () => {
    expect(mergeSamples("line", real, [], { date: "2026-12-17" })).toBe(real);
    expect(mergeSamples("line", real, all, { date: "2030-01-01" })).toBe(real);   // (none of that kind on that date)
  });
  it("with samples: the real rows stay, in place and unchanged; the samples follow, marked sample:true with ids sample:…; only that kind and date", () => {
    const before = JSON.stringify(real);
    const out = mergeSamples("line", real, all, { date: "2026-12-17" }) as any[];
    expect(out.slice(0, 2)).toEqual(real);
    expect(out.length).toBe(3);
    expect(out[2]).toMatchObject({ sample: true, id: "sample:a1", kind: "line", date: "2026-12-17" });
    expect(JSON.stringify(real)).toBe(before);
    expect(out).not.toBe(real);
    expect(mergeSamples("line", [], all, { date: "2026-12-18" }).map((x: any) => x.id)).toEqual(["sample:a2"]);
    expect(mergeSamples("unconfirmed", [], all, { date: "2026-12-17" }).map((x: any) => x.id)).toEqual(["sample:b1"]);
  });
  it("a city: only the maybes whose slot starts with that city's key", () => {
    expect(mergeSamples("maybe", [], all, { cityKey: "city-a" }).map((x: any) => x.id)).toEqual(["sample:d1"]);
    expect(mergeSamples("maybe", [], all, { cityKey: "city-z" })).toEqual([]);
  });
  it("sampleFor: the one of a kind for a date, or null", () => {
    expect(sampleFor("summary", "2026-12-17", all)).toMatchObject({ id: "sample:c1", sample: true });
    expect(sampleFor("summary", "2026-12-18", all)).toBeNull();
    expect(sampleFor("trip_photo", "2026-12-17", all)?.id).toBe("sample:f1");
    expect(sampleFor("summary", "2026-12-17", [])).toBeNull();
  });
  it("a string keeps its marker; a time of '10:30' + marker reads as 10:30", async () => {
    const out = mergeSamples("line", [], all, { date: "2026-12-17" }) as any[];
    expect(out[0].data.title.endsWith(SAMPLE_MARKER)).toBe(true);
    expect(out[0].data.time).toBe(`10:30${SAMPLE_MARKER}`);
    expect(withoutMarker(out[0].data.time)).toBe("10:30");
    const { tripClockMinutes } = await import("../../frontend/src/lib/guideDisplay.ts");
    expect(tripClockMinutes({ time: withoutMarker(out[0].data.time), timeZone: null, date: "2026-12-17T00:00:00.000Z" } as any, "Asia/Ho_Chi_Minh")).toBe(630);
  });
});

describe("C10 no kept copy holds a sample", () => {
  it("with samples loaded in memory, each lib that keeps a copy runs and nothing stored holds the marker or 'sample:'", async () => {
    const got = await loadSamples(TRIP);
    expect(got.length).toBe(rows.length);
    const { guideData } = await import("../../frontend/src/lib/guideData.ts");
    const { daySummaries } = await import("../../frontend/src/lib/daySummaries.ts");
    const { keepCopy } = await import("../../frontend/src/lib/tripNotes.ts");
    const { loadLedger } = await import("../../frontend/src/lib/expenses.ts");
    const { photosOf } = await import("../../frontend/src/lib/tripPhotos.ts");
    await guideData(TRIP);
    await daySummaries(TRIP);
    keepCopy(TRIP, [{ id: "n1", text: "A real note" } as any]);
    await loadLedger(TRIP);
    await photosOf(TRIP, "2026-12-17");
    const kept = [...store.entries()].filter(([k]) => k !== "wander_token");
    expect(kept.length).toBeGreaterThanOrEqual(5);           // (each of the five did keep a copy: the check had something to read)
    for (const [k, v] of kept) { expect(v, k).not.toContain(SAMPLE_MARKER); expect(v, k).not.toContain("sample:"); }
    expect([...store.keys()].some((k) => k.includes("sample"))).toBe(false);
  });
  it("the samples themselves are never written to storage by loadSamples", async () => {
    await loadSamples(TRIP);
    expect([...store.entries()].filter(([k]) => k !== "wander_token")).toEqual([]);
  });
  it("memory is per person and trip: asked once, not again; another person asks again; forgetSamples() makes the next load fetch again", async () => {
    await loadSamples(TRIP);
    await loadSamples(TRIP);
    const asks = () => fetched.filter((u) => u.startsWith("/api/samples/")).length;
    expect(asks()).toBe(1);
    store.set("wander_token", OTHER);
    await loadSamples(TRIP);
    expect(asks()).toBe(2);
    store.set("wander_token", TOKEN);
    await loadSamples("trip-2");
    expect(asks()).toBe(3);
    forgetSamples();
    await loadSamples(TRIP);
    expect(asks()).toBe(4);
  });
  it("offline, refused or any error: []; and a failed ask is not remembered", async () => {
    nav({ onLine: false });
    expect(await loadSamples(TRIP)).toEqual([]);
    expect(fetched.length).toBe(0);
    nav();
    network = "down";
    expect(await loadSamples(TRIP)).toEqual([]);
    network = "up";
    expect((await loadSamples(TRIP)).length).toBe(rows.length);
  });
});

describe("C11 words with the marker never leave the phone", () => {
  it("noSampleText: null for text with the marker, the text itself otherwise", () => {
    expect(noSampleText(`A thought${M}`)).toBeNull();
    expect(noSampleText(`Dinner at ${M} the market`)).toBeNull();
    expect(noSampleText("A real thought")).toBe("A real thought");
    expect(noSampleText("")).toBe("");
  });
  it("sendCopy, the moved tellGroup send and sendToGuideOwner call neither navigator.share nor the clipboard with marker text", async () => {
    const { sendCopy } = await import("../../frontend/src/lib/tripNotes.ts");
    const { tellGroup } = await import("../../frontend/src/lib/tellGroup.ts");
    const { sendToGuideOwner } = await import("../../frontend/src/lib/tellGuideOwner.ts");
    const share = vi.fn(async () => {}), write = vi.fn(async () => {});
    nav({ share, clipboard: { writeText: write } });
    expect(await sendCopy(`A thought${M}`, "A note")).toBe("cancelled");
    expect(await tellGroup("Ken", `The market${M}`, null, "City A")).toBeNull();
    expect(await tellGroup("Ken", "The market", `https://example.com/${M}`, "City A", "the plan")).toBeNull();
    expect(await sendToGuideOwner("Larisa", `A plan${M}`)).toBeNull();
    expect(share).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    // …and without the marker they work as before
    expect(await sendCopy("A real thought", "A note")).toBe("shared");
    expect(await tellGroup("Ken", "The market", null, "City A")).toBeNull();
    expect(share).toHaveBeenCalledTimes(2);
    nav({ share: undefined, clipboard: { writeText: write } });
    expect(await tellGroup("Ken", "The market", null, "City A")).toBe("Copied — paste it into your group text.");
    expect(await sendToGuideOwner("Larisa", "A plan")).toMatch(/^Copied/);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
