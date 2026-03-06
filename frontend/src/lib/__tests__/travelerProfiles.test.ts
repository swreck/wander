/**
 * Comprehensive simulation of the traveler profiles / easter egg system.
 * Tests keyword matching, rate limiting, nudge variety, hash consistency,
 * edge cases, and all four traveler profiles.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getNudgesForPlace,
  getNudgeForExperience,
  canShowDailyGreeting,
  recordDailyGreeting,
  getDailyGreeting,
} from "../travelerProfiles";

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  length: 0,
  key: vi.fn(() => null),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

function clearStore() {
  Object.keys(store).forEach(k => delete store[k]);
}

describe("Traveler Profiles — Easter Egg System", () => {

  beforeEach(() => {
    clearStore();
    vi.clearAllMocks();
  });

  // ── Profile Coverage ──────────────────────────────────────────────

  describe("Ken's interests", () => {
    it("matches AI/tech keywords", () => {
      const nudge = getNudgeForExperience("Ken", "Tokyo AI Innovation Lab", ["technology"]);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Ken");
    });

    it("matches philosophy/bookstore keywords", () => {
      const nudge = getNudgeForExperience("Ken", "Daikanyama Bookstore", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Ken");
    });

    it("matches cooking class keywords", () => {
      const nudge = getNudgeForExperience("Ken", "Kyoto Cooking Class", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Ken");
    });

    it("matches art gallery keywords", () => {
      const nudge = getNudgeForExperience("Ken", "Contemporary Art Museum", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Ken");
    });

    it("matches Japanese culture keywords", () => {
      const nudge = getNudgeForExperience("Ken", "Tea Ceremony Experience", ["japanese"]);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Ken");
    });

    it("does NOT match unrelated places", () => {
      const nudge = getNudgeForExperience("Ken", "Pizza Palace", ["food"]);
      expect(nudge).toBeNull();
    });
  });

  describe("Julie's interests", () => {
    it("matches ceramics/pottery", () => {
      const nudge = getNudgeForExperience("Julie", "Mashiko Pottery Village", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Julie");
    });

    it("matches fresh produce/markets", () => {
      const nudge = getNudgeForExperience("Julie", "Nishiki Farmers Market", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Julie");
    });

    it("matches cooking class", () => {
      const nudge = getNudgeForExperience("Julie", "Sushi Cooking Class", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Julie");
    });

    it("matches sportswear via keywords", () => {
      const nudge = getNudgeForExperience("Julie", "Premium Activewear Store", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Julie");
    });

    it("does NOT match unrelated places", () => {
      const nudge = getNudgeForExperience("Julie", "Zen Buddhist Temple", ["temples"]);
      expect(nudge).toBeNull();
    });
  });

  describe("Larisa's interests", () => {
    it("matches ceramic frogs (for her mother)", () => {
      const nudge = getNudgeForExperience("Larisa", "Handmade Frog Figurines", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches tulips/flowers", () => {
      const nudge = getNudgeForExperience("Larisa", "Amsterdam Tulip Museum", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches ceramics (shared interest with Julie)", () => {
      const nudge = getNudgeForExperience("Larisa", "Bizen Pottery Studio", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches artisan gift shops", () => {
      const nudge = getNudgeForExperience("Larisa", "Local Handmade Craft Boutique", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches sweet treats — custard", () => {
      const nudge = getNudgeForExperience("Larisa", "Famous Custard Tart Shop", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches sweet treats — matcha", () => {
      const nudge = getNudgeForExperience("Larisa", "Matcha Cafe Uji", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches sweet treats — donut", () => {
      const nudge = getNudgeForExperience("Larisa", "Artisan Donut Shop", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches sweet treats — bakery", () => {
      const nudge = getNudgeForExperience("Larisa", "French Patisserie", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("matches sportswear", () => {
      const nudge = getNudgeForExperience("Larisa", "Sports Equipment Store", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Larisa");
    });

    it("does NOT match unrelated places", () => {
      const nudge = getNudgeForExperience("Larisa", "AI Innovation Center", ["technology"]);
      expect(nudge).toBeNull();
    });
  });

  describe("Andy's interests", () => {
    it("matches Buddhist temples/meditation", () => {
      const nudge = getNudgeForExperience("Andy", "Zen Buddhist Temple", ["temples"]);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Andy");
    });

    it("matches meditation via keyword", () => {
      const nudge = getNudgeForExperience("Andy", "Morning Meditation Garden", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Andy");
    });

    it("matches AI/tech innovation", () => {
      const nudge = getNudgeForExperience("Andy", "Startup Innovation Hub", ["technology"]);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Andy");
    });

    it("matches bookstores", () => {
      const nudge = getNudgeForExperience("Andy", "Philosophy Bookstore", []);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Andy");
    });

    it("does NOT match unrelated places", () => {
      const nudge = getNudgeForExperience("Andy", "Ceramic Frog Shop", ["shopping"]);
      expect(nudge).toBeNull();
    });
  });

  // ── Theme-Based Matching ──────────────────────────────────────────

  describe("theme-based matching (getNudgeForExperience)", () => {
    it("matches via theme even if name has no keywords", () => {
      // "Kinkaku-ji" doesn't contain "temple" but themes=["temples"] should not match
      // because theme matching checks if theme string contains interest keywords
      // "temples" contains "temple" -> should match Andy
      const nudge = getNudgeForExperience("Andy", "Kinkaku-ji", ["temple"]);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Andy");
    });

    it("matches Ken via art theme", () => {
      const nudge = getNudgeForExperience("Ken", "Naoshima Island", ["contemporary art"]);
      expect(nudge).toBeTruthy();
      expect(nudge).toContain("Ken");
    });

    it("no match when themes are irrelevant", () => {
      const nudge = getNudgeForExperience("Ken", "Random Place", ["nature", "hiking"]);
      expect(nudge).toBeNull();
    });
  });

  // ── Rate Limiting (getNudgesForPlace) ─────────────────────────────

  describe("rate limiting on map nudges", () => {
    it("returns a nudge on first call", () => {
      const nudge = getNudgesForPlace("Andy", "Zen Temple", ["buddhist_temple"]);
      expect(nudge).toBeTruthy();
    });

    it("returns null on second call (rate limited)", () => {
      getNudgesForPlace("Andy", "Zen Temple", ["buddhist_temple"]);
      const second = getNudgesForPlace("Andy", "Another Temple", ["buddhist_temple"]);
      expect(second).toBeNull();
    });

    it("different users are rate-limited independently", () => {
      getNudgesForPlace("Andy", "Zen Temple", ["buddhist_temple"]);
      // Andy is now rate-limited, but Ken should still get one
      const kenNudge = getNudgesForPlace("Ken", "AI Lab Innovation Center", []);
      expect(kenNudge).toBeTruthy();
    });

    it("rate limit resets after 8 hours", () => {
      getNudgesForPlace("Andy", "Zen Temple", ["buddhist_temple"]);

      // Simulate 9 hours passing
      const stored = JSON.parse(store["wander:last-nudge"]);
      stored["Andy"] = Date.now() - (9 * 60 * 60 * 1000);
      store["wander:last-nudge"] = JSON.stringify(stored);

      const nudge = getNudgesForPlace("Andy", "Meditation Center", []);
      expect(nudge).toBeTruthy();
    });
  });

  // ── No Rate Limiting (getNudgeForExperience) ──────────────────────

  describe("experience detail nudges have no rate limit", () => {
    it("returns nudge every time for same user", () => {
      const n1 = getNudgeForExperience("Andy", "Zen Temple", ["buddhist_temple"]);
      const n2 = getNudgeForExperience("Andy", "Meditation Garden", []);
      const n3 = getNudgeForExperience("Andy", "Buddhist Monastery", []);
      expect(n1).toBeTruthy();
      expect(n2).toBeTruthy();
      expect(n3).toBeTruthy();
    });

    it("still returns nudge after map nudge was rate-limited", () => {
      // Trigger rate limit via map nudge
      getNudgesForPlace("Ken", "AI Innovation Lab", []);
      // Experience detail should still work
      const nudge = getNudgeForExperience("Ken", "Robotics Exhibition", []);
      expect(nudge).toBeTruthy();
    });
  });

  // ── Hash Consistency & Variety ────────────────────────────────────

  describe("nudge consistency and variety", () => {
    it("same place + same day = same nudge (deterministic)", () => {
      const n1 = getNudgeForExperience("Ken", "Tokyo Art Gallery", []);
      const n2 = getNudgeForExperience("Ken", "Tokyo Art Gallery", []);
      expect(n1).toBe(n2);
    });

    it("different places = potentially different nudges", () => {
      // With enough different places, we should get variation
      const nudges = new Set<string>();
      const places = [
        "Zen Temple Garden",
        "Ancient Buddhist Shrine",
        "Mountain Monastery Meditation",
        "Downtown Zazen Center",
        "Contemplative Temple Retreat",
      ];
      for (const p of places) {
        const n = getNudgeForExperience("Andy", p, []);
        if (n) nudges.add(n);
      }
      // Should have at least 2 different nudge messages across 5 matching places
      expect(nudges.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("unknown user returns null", () => {
      expect(getNudgeForExperience("Stranger", "Zen Temple", [])).toBeNull();
      expect(getNudgesForPlace("Stranger", "Zen Temple", [])).toBeNull();
    });

    it("empty place name returns null", () => {
      expect(getNudgeForExperience("Ken", "", [])).toBeNull();
    });

    it("case insensitive keyword matching", () => {
      const nudge = getNudgeForExperience("Ken", "ARTIFICIAL INTELLIGENCE EXPO", []);
      expect(nudge).toBeTruthy();
    });

    it("partial keyword match in place name", () => {
      // "bookstore" is a keyword, "The Old Bookstore" should match
      const nudge = getNudgeForExperience("Ken", "The Old Bookstore", []);
      expect(nudge).toBeTruthy();
    });

    it("handles corrupted localStorage gracefully", () => {
      store["wander:last-nudge"] = "not valid json!!!";
      // Should not throw, should return a nudge
      const nudge = getNudgesForPlace("Ken", "AI Lab Innovation", []);
      expect(nudge).toBeTruthy();
    });

    it("handles non-numeric timestamp in localStorage without crashing", () => {
      store["wander:last-nudge"] = JSON.stringify({ Ken: "not a number" });
      // NaN comparison means rate limit blocks — but it doesn't crash
      const nudge = getNudgesForPlace("Ken", "AI Innovation Lab", []);
      // This returns null because NaN >= 8 is false, so rate limit blocks.
      // The important thing is no exception is thrown.
      expect(nudge).toBeNull();
    });
  });

  // ── Cross-Interest Overlap ────────────────────────────────────────

  describe("cross-interest and shared nudges", () => {
    it("Julie and Larisa both match ceramics", () => {
      const julie = getNudgeForExperience("Julie", "Mashiko Ceramic Studio", []);
      const larisa = getNudgeForExperience("Larisa", "Mashiko Ceramic Studio", []);
      expect(julie).toBeTruthy();
      expect(larisa).toBeTruthy();
      expect(julie).toContain("Julie");
      expect(larisa).toContain("Larisa");
      // Different people get their own personalized message
      expect(julie).not.toEqual(larisa);
    });

    it("Ken and Andy both match AI/tech", () => {
      const ken = getNudgeForExperience("Ken", "AI Innovation Center", []);
      const andy = getNudgeForExperience("Andy", "AI Innovation Center", []);
      expect(ken).toBeTruthy();
      expect(andy).toBeTruthy();
      expect(ken).toContain("Ken");
      expect(andy).toContain("Andy");
    });

    it("Ken and Andy both match bookstores", () => {
      const ken = getNudgeForExperience("Ken", "Philosophy Bookstore", []);
      const andy = getNudgeForExperience("Andy", "Philosophy Bookstore", []);
      expect(ken).toBeTruthy();
      expect(andy).toBeTruthy();
    });
  });

  // ── Realistic Place Name Simulation ───────────────────────────────

  describe("realistic place name simulation", () => {
    const scenarios: { user: string; place: string; themes: string[]; shouldMatch: boolean }[] = [
      // Andy — temples
      { user: "Andy", place: "Kiyomizu-dera Temple", themes: [], shouldMatch: true },
      { user: "Andy", place: "Fushimi Inari Shrine", themes: [], shouldMatch: true },
      { user: "Andy", place: "Ryoan-ji Zen Garden", themes: ["zen"], shouldMatch: true },
      // Andy — AI
      { user: "Andy", place: "TeamLab Borderless", themes: ["technology"], shouldMatch: true },
      // Andy — no match
      { user: "Andy", place: "Tsukiji Fish Market", themes: ["food"], shouldMatch: false },

      // Julie — ceramics
      { user: "Julie", place: "Shigaraki Pottery Trail", themes: [], shouldMatch: true },
      { user: "Julie", place: "Bizen Ceramic Village", themes: [], shouldMatch: true },
      // Julie — produce
      { user: "Julie", place: "Omicho Fresh Fruit Market", themes: [], shouldMatch: true },
      // Julie — sportswear
      { user: "Julie", place: "Descente Performance Wear Osaka", themes: [], shouldMatch: true },
      // Julie — no match
      { user: "Julie", place: "Fushimi Inari Shrine", themes: ["temples"], shouldMatch: false },

      // Larisa — frogs
      { user: "Larisa", place: "Lucky Frog Ceramics Shop", themes: [], shouldMatch: true },
      // Larisa — tulips
      { user: "Larisa", place: "Bloemenmarkt Flower Market", themes: [], shouldMatch: true },
      // Larisa — sweets
      { user: "Larisa", place: "Kyoto Matcha House", themes: [], shouldMatch: true },
      { user: "Larisa", place: "Famous Croissant Bakery", themes: [], shouldMatch: true },
      { user: "Larisa", place: "Gelato Artisans", themes: [], shouldMatch: true },
      // Larisa — gifts
      { user: "Larisa", place: "Handmade Kyoto Souvenirs", themes: [], shouldMatch: true },
      // Larisa — no match
      { user: "Larisa", place: "Tech Startup Hub", themes: ["technology"], shouldMatch: false },

      // Ken — AI
      { user: "Ken", place: "Machine Learning Conference Hall", themes: [], shouldMatch: true },
      // Ken — Japanese
      { user: "Ken", place: "Wabi-Sabi Design Gallery", themes: [], shouldMatch: true },
      { user: "Ken", place: "Ukiyo-e Woodblock Print Museum", themes: [], shouldMatch: true },
      // Ken — art
      { user: "Ken", place: "Modern Art Gallery Roppongi", themes: [], shouldMatch: true },
      // Ken — no match
      { user: "Ken", place: "Sports Equipment Outlet", themes: ["shopping"], shouldMatch: false },
    ];

    for (const s of scenarios) {
      it(`${s.user} ${s.shouldMatch ? "matches" : "skips"}: "${s.place}"`, () => {
        const nudge = getNudgeForExperience(s.user, s.place, s.themes);
        if (s.shouldMatch) {
          expect(nudge).toBeTruthy();
          expect(nudge).toContain(s.user);
        } else {
          expect(nudge).toBeNull();
        }
      });
    }
  });

  // ── Nudge Quality Check ───────────────────────────────────────────

  describe("nudge message quality", () => {
    it("nudges are conversational, not robotic", () => {
      const nudge = getNudgeForExperience("Andy", "Zen Meditation Temple", []);
      expect(nudge).toBeTruthy();
      // Should not contain robotic phrases
      expect(nudge).not.toMatch(/ALERT|WARNING|NOTIFICATION|RECOMMENDED/i);
      // Should contain the person's name naturally
      expect(nudge).toMatch(/^Andy[,]/);
    });

    it("nudges for Larisa mention mother when relevant", () => {
      const nudge = getNudgeForExperience("Larisa", "Ceramic Frog Gallery", []);
      expect(nudge).toBeTruthy();
      // Frog nudges should mention mother/mom
      expect(nudge).toMatch(/mother|mom/i);
    });

    it("at least one Larisa ceramics nudge mentions Julie", () => {
      // Hash varies by place name, so test multiple to find one that mentions Julie
      const places = [
        "Pottery Workshop Studio",
        "Ceramics Studio Tour",
        "Clay Art Workshop",
        "Porcelain Making Class",
        "Kiln Firing Experience",
      ];
      const nudges = places.map(p => getNudgeForExperience("Larisa", p, [])).filter(Boolean);
      expect(nudges.length).toBeGreaterThan(0);
      const anyMentionsJulie = nudges.some(n => /Julie/i.test(n!));
      expect(anyMentionsJulie).toBe(true);
    });
  });

  // ── Daily Greeting System ─────────────────────────────────────────

  describe("daily greeting", () => {
    it("canShowDailyGreeting returns true on first call", () => {
      expect(canShowDailyGreeting("Ken")).toBe(true);
    });

    it("canShowDailyGreeting returns false after recording", () => {
      recordDailyGreeting("Ken");
      expect(canShowDailyGreeting("Ken")).toBe(false);
    });

    it("different users have independent greeting state", () => {
      recordDailyGreeting("Ken");
      expect(canShowDailyGreeting("Ken")).toBe(false);
      expect(canShowDailyGreeting("Julie")).toBe(true);
    });

    it("greeting resets next day", () => {
      recordDailyGreeting("Andy");
      // Today's date is stored — should be blocked
      expect(canShowDailyGreeting("Andy")).toBe(false);
      // Simulate yesterday's date stored — should allow (new day)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      store["wander:last-greeting"] = JSON.stringify({ Andy: yesterday.toDateString() });
      expect(canShowDailyGreeting("Andy")).toBe(true);
    });

    it("generates greeting with matching experience", () => {
      const greeting = getDailyGreeting("Andy", [
        { name: "Zen Meditation Temple", themes: [] },
        { name: "Sushi Restaurant", themes: ["food"] },
      ], "Kyoto");
      expect(greeting).toBeTruthy();
      expect(greeting).toContain("Andy");
      expect(greeting).toContain("Zen Meditation Temple");
    });

    it("generates greeting for Ken with AI match", () => {
      const greeting = getDailyGreeting("Ken", [
        { name: "AI Innovation Lab", themes: ["technology"] },
      ], "Tokyo");
      expect(greeting).toBeTruthy();
      expect(greeting).toContain("Ken");
      expect(greeting).toContain("AI Innovation Lab");
    });

    it("generates greeting for Larisa with bakery match", () => {
      const greeting = getDailyGreeting("Larisa", [
        { name: "Famous Matcha Bakery", themes: [] },
      ], "Kyoto");
      expect(greeting).toBeTruthy();
      expect(greeting).toContain("Larisa");
      expect(greeting).toContain("Famous Matcha Bakery");
    });

    it("generates generic greeting when no interest match", () => {
      const greeting = getDailyGreeting("Ken", [
        { name: "Random Place", themes: [] },
      ], "Osaka");
      expect(greeting).toBeTruthy();
      expect(greeting).toContain("Ken");
      expect(greeting).toContain("Osaka");
    });

    it("generates fallback greeting when no experiences and no city", () => {
      const greeting = getDailyGreeting("Julie", [], undefined);
      expect(greeting).toBeTruthy();
      expect(greeting).toContain("Julie");
    });

    it("greeting includes time-appropriate salutation", () => {
      const greeting = getDailyGreeting("Andy", [], "Tokyo");
      expect(greeting).toBeTruthy();
      expect(greeting).toMatch(/Good (morning|afternoon|evening)/);
    });

    it("unknown user returns null", () => {
      expect(getDailyGreeting("Stranger", [], "Tokyo")).toBeNull();
    });

    it("greeting is deterministic within same day", () => {
      const g1 = getDailyGreeting("Ken", [{ name: "Art Gallery Tour", themes: [] }], "Tokyo");
      const g2 = getDailyGreeting("Ken", [{ name: "Art Gallery Tour", themes: [] }], "Tokyo");
      expect(g1).toBe(g2);
    });
  });
});
