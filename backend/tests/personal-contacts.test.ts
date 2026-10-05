/**
 * A person's own email address and US phone number are left out of her tabs' words (Oct 4: a forwarded hotel
 * confirmation pasted into a tab carried the sender's personal address and phone). A hotel's or restaurant's own address
 * and its Japanese number stay. Made-up people and numbers.
 */
import { describe, it, expect } from "vitest";
import { withoutPersonalContacts } from "../src/services/sources/filter.js";

describe("personal contacts in her tabs", () => {
  it("a personal email address and a US phone number are left out", () => {
    const fwd = "From: Pat Example <pat.example@gmail.com> · To: Sam <sam@comcast.net> · Pat Example · 415.555.0199 · (650) 555-0123";
    const out = withoutPersonalContacts(fwd);
    expect(out).not.toMatch(/gmail|comcast|555/);
    expect(out).toBe("From: Pat Example <[email left out by Wander]> · To: Sam <[email left out by Wander]> · Pat Example · [phone left out by Wander] · [phone left out by Wander]");
  });
  it("a hotel's or restaurant's own address and Japanese numbers stay", () => {
    const hotel = "Reception · E-mail. reception@robuchon.jp · Tel. 03-5424-1338 · Kyoto 075-344-8888 · +81-3-3516-9600 · reservations@fourseasons.com";
    expect(withoutPersonalContacts(hotel)).toBe(hotel);
  });
  it("other numbers stay — a confirmation, a reservation, a price, a time range", () => {
    const t = "Confirmation 9012345678 · Reservation #40000 · ¥12,000 · 6:15-6:45p · 2026-10-27";
    expect(withoutPersonalContacts(t)).toBe(t);
  });
});
