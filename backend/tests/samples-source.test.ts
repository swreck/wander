/**
 * S2c C6 (Nov 17 2026): where samples may be read, drawn and kept is a fact about the source, so it is checked in the source.
 * (The backend half of "only the samples route reads the table" is also the one assertion S2b's test S6 was changed to.)
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = new URL("../..", import.meta.url).pathname;
const filesWith = (pattern: string, dir: string): string[] => {
  try { return execFileSync("grep", ["-rlE", pattern, dir], { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).sort(); } catch { return []; }   // (exit 1: no match)
};
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("C6 source reads", () => {
  it("backend: sampleEntry and sample_entries appear only in the two files of rule 3", () => {
    const hits = filesWith("sampleEntry|sample_entries", "backend/src");
    expect(hits).toContain("backend/src/services/samples.ts");
    expect(hits.filter((f) => !["backend/src/routes/samples.ts", "backend/src/services/samples.ts"].includes(f))).toEqual([]);
  });
  it("phone: the route's address '/samples/' is only in lib/samples.ts", () => {
    expect(filesWith("/samples/", "frontend/src")).toEqual(["frontend/src/lib/samples.ts"]);
  });
  it("phone: mergeSamples( and sampleFor( are only in lib/samples.ts, DayPage, DayPhotos, IdeasPage and NotesPage", () => {
    const hits = filesWith("mergeSamples(<[^>]*>)?\\(|sampleFor(<[^>]*>)?\\(", "frontend/src");
    expect(hits).toEqual([
      "frontend/src/components/DayPhotos.tsx", "frontend/src/lib/samples.ts", "frontend/src/pages/DayPage.tsx", "frontend/src/pages/IdeasPage.tsx", "frontend/src/pages/NotesPage.tsx",
    ]);
    // (and loadSamples is called only by the four screens, never by a lib that keeps a copy)
    expect(filesWith("loadSamples\\(", "frontend/src")).toEqual([
      "frontend/src/components/DayPhotos.tsx", "frontend/src/lib/samples.ts", "frontend/src/pages/DayPage.tsx", "frontend/src/pages/IdeasPage.tsx", "frontend/src/pages/NotesPage.tsx",
    ]);
  });
  it("phone: lib/samples.ts holds none of localStorage, sessionStorage, indexedDB, caches", () => {
    const text = read("frontend/src/lib/samples.ts");
    for (const w of ["localStorage", "sessionStorage", "indexedDB", "caches"]) expect(text, w).not.toContain(w);
  });
  it("phone: SampleTag.tsx imports none of lib/placePhotos, lib/linePlaces, lib/placeAbout, lib/api or SendOut", () => {
    const imports = read("frontend/src/components/SampleTag.tsx").split("\n").filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l)).join("\n");
    for (const f of ["placePhotos", "linePlaces", "placeAbout", "lib/api", "SendOut"]) expect(imports, f).not.toContain(f);
    expect(imports).toContain("../lib/samples");   // (the types alone)
    expect(imports).toMatch(/import type \{ SampleItem \} from "..\/lib\/samples"/);
  });
  it("phone: the service worker never keeps /api/samples", () => {
    expect(read("frontend/src/sw.ts")).toMatch(/NEVER_CACHED = \[[^\]]*'\/api\/samples'/);
  });
  it("phone: every element a sample draws carries data-sample (SampleTag.tsx: each opening tag of a sample)", () => {
    const text = read("frontend/src/components/SampleTag.tsx").replace(/=>/g, "=_");   // (an arrow's > is not a tag's end)
    const tags = [...text.matchAll(/<(div|svg|rect|g|text|span|li|button|p)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes("data-sample"));
    // (the span of the SampleTag pill and every other tag carry it; none is missing)
    expect(tags).toEqual([]);
  });
});
