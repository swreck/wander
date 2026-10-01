/**
 * A picture names the group a plan line doesn't (round 13, Oct 1 2026): her Kyoto map lists "You & Julie (morning)" over
 * Maruni Toryo while her day tab's table names no one, and Wander said "Your Guide doesn't name the group".
 * pictureGroupFor quotes the picture's heading — and finds nothing where nothing is there. Invented text, her map's shape.
 */
import { describe, it, expect } from "vitest";
import { pictureGroupFor, pictureStartFor } from "../src/services/guide/pictureGroup.js";

describe("where a booking picture says a tour starts (round 13: Cycle Kyoto vs NORU)", () => {
  const VIATOR = "Activity details\n• Must arrive 15 minutes prior to departure\n• No-shows or missed tours due to lateness are nonrefundable\nItinerary ✕\nStart your cycle adventure in the morning at Kyoto's NORU bicycle shop. After getting outfitted with an included bike and helmet.";
  it("quotes the place and the arrive-early rule", () => {
    expect(pictureStartFor(VIATOR)).toEqual({ place: "Kyoto's NORU bicycle shop", arrive: "Must arrive 15 minutes prior to departure" });
  });
  it("a picture that names no starting place gives nothing", () => {
    expect(pictureStartFor("Start time 1:00 PM. Duration 3 hours. Bring water.")).toBeNull();
    expect(pictureStartFor("")).toBeNull();
  });
});

const MAP = [
  "Wednesday Oct 28 — Shigaraki Ceramics Day",
  "Kyoto (Four Seasons)",
  "MIHO Museum (Ken & Andy)",
  "You & Julie (morning)",
  "• Traditional Industry Hall",
  "• Maruni Toryo (tools & clay)",
  "• Wood-firing potter (e.g., Eizan-gama)",
  "Private van (8:00–9:15 am, 5:30–6:45 pm)",
  "Kyoto Station",
  "Arashiyama",
  "• Bamboo Forest",
  "• Tenryu-ji",
].join("\n");
const PEOPLE = ["larisa", "ken", "julie", "andy"];

describe("a picture's group heading for a line that names no one", () => {
  it("finds the heading over the same place, with its siblings", () => {
    const g = pictureGroupFor("Maruni Toryo — tools and clay", [MAP], PEOPLE);
    expect(g?.heading).toBe("You & Julie (morning)");
    expect(g?.with).toEqual(["Traditional Industry Hall", "Wood-firing potter (e.g., Eizan-gama)"]);
  });
  it("a heading with no one in it is not a group", () => {
    expect(pictureGroupFor("Bamboo Forest walk", [MAP], PEOPLE)).toBeNull();
  });
  it("a place the picture doesn't bullet, or doesn't have, finds nothing", () => {
    expect(pictureGroupFor("Taxi to Kyoto Station", [MAP], PEOPLE)).toBeNull();
    expect(pictureGroupFor("Lunch at Café ENSOU", [MAP], PEOPLE)).toBeNull();
    expect(pictureGroupFor("", [MAP], PEOPLE)).toBeNull();
    expect(pictureGroupFor("Maruni Toryo", [], PEOPLE)).toBeNull();
  });
  it("a picture line's extra words don't have to be in the plan line, but all of its place name does", () => {
    expect(pictureGroupFor("Traditional Industry Hall", [MAP], PEOPLE)?.heading).toBe("You & Julie (morning)");
    expect(pictureGroupFor("Industry tour", [MAP], PEOPLE)).toBeNull();
  });
});
