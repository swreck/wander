/**
 * HER NOTE FOR A STAY, FROM ITS HEADING (Sep 30 round 9) — everything she wrote in the heading except the city's
 * name. Her Okayama heading ends "- WHERE IS BIZEN TOUR STARTING" after the brackets; only the brackets were
 * kept, so her open question vanished and the tour looked settled. Pure text; no database, no Claude.
 */
import { describe, it, expect } from "vitest";
import { stopNoteOf } from "../src/services/guide/importSnapshot.js";

describe("a stay's note from her heading", () => {
  it("keeps her working note after the brackets (the Bizen question)", () => {
    expect(stopNoteOf("Okayama (day trip to Bizen - 40 min JR train) - WHERE IS BIZEN TOUR STARTING"))
      .toBe("day trip to Bizen - 40 min JR train — WHERE IS BIZEN TOUR STARTING");
  });

  it("keeps a note inside a bracket that closes late (Tokyo's ASK KENJI)", () => {
    expect(stopNoteOf("Tokyo (day trip to Mashiko - 1.5 hrs Shinkansen to Utsunomiya + car/taxi to Mashiko) - ASK KENJI TO INTEGRATE THE 2 TOURS AND FINISH 3:45-4p AT TRAIN)"))
      .toBe("day trip to Mashiko - 1.5 hrs Shinkansen to Utsunomiya + car/taxi to Mashiko - ASK KENJI TO INTEGRATE THE 2 TOURS AND FINISH 3:45-4p AT TRAIN");
  });

  it("a stray bracket never cuts the note in half (Karatsu)", () => {
    expect(stopNoteOf("Karatsu (tour Karatsu - coordinate pu for tour), day trip to Arita)"))
      .toBe("tour Karatsu - coordinate pu for tour, day trip to Arita");
  });

  it("keeps a note before the brackets", () => {
    expect(stopNoteOf("Hakata - NOT AN OVERNIGHT (travel through)")).toBe("NOT AN OVERNIGHT — travel through");
  });

  it("a Backroads leg's day count is not a note; a bare city has none", () => {
    expect(stopNoteOf("Backroads - Tokyo->Nikko (Day 1-4)")).toBeNull();
    expect(stopNoteOf("Kyoto ")).toBeNull();
    expect(stopNoteOf("Nagoya (day trip to Tokoname - 40 min by Meitetsu train)")).toBe("day trip to Tokoname - 40 min by Meitetsu train");
  });
});
