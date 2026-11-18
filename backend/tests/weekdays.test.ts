/**
 * G6 (Nov 17 2026): a weekday Scout writes beside a date is checked against the calendar. The service is pure.
 */
import { describe, it, expect } from "vitest";
import { wrongWeekdays, withoutWrongWeekdays } from "../src/services/weekdays.js";

const DEC = { start: "2026-12-14", end: "2027-01-08" };
const JAPAN = { start: "2026-10-13", end: "2026-10-29" };

describe("wrongWeekdays", () => {
  it("'Monday, Dec 22' is wrong: Dec 22 2026 is a Tuesday", () => {
    expect(wrongWeekdays("The night of Monday, Dec 22 is at Stay A.", DEC)).toEqual([{ said: "Monday, Dec 22", date: "2026-12-22", is: "Tuesday" }]);
  });
  it("'Tue, Dec 22' is right: nothing", () => {
    expect(wrongWeekdays("Tue, Dec 22", DEC)).toEqual([]);
  });
  it("'Fri., January 1st' is right (Jan 1 2027 is a Friday): the year comes from the trip's dates", () => {
    expect(wrongWeekdays("You land Fri., January 1st.", DEC)).toEqual([]);
    expect(wrongWeekdays("You land Thu., January 1st.", DEC)).toEqual([{ said: "Thu., January 1st", date: "2027-01-01", is: "Friday" }]);
  });
  it("Japan's trip: 'Monday, Oct 19' is right, 'Sunday, Oct 19' is wrong (it is a Monday)", () => {
    expect(wrongWeekdays("Monday, Oct 19", JAPAN)).toEqual([]);
    expect(wrongWeekdays("Sunday, Oct 19", JAPAN)).toEqual([{ said: "Sunday, Oct 19", date: "2026-10-19", is: "Monday" }]);
  });
  it("a date no year puts inside the trip (July 4 on December's trip) is skipped", () => {
    expect(wrongWeekdays("Saturday, July 4", DEC)).toEqual([]);
  });
  it("a date alone, or a full stop between the weekday and the date, says nothing", () => {
    expect(wrongWeekdays("Dec 22", DEC)).toEqual([]);
    expect(wrongWeekdays("Sunday. Dec 22 is open", DEC)).toEqual([]);
  });
  it("a range or a list of weekdays is skipped: -, –, /, to, and", () => {
    for (const t of ["Wed–Thu, Dec 23–24", "Wed-Thu, Dec 23", "Wed/Thu, Dec 23", "Wed to Thu, Dec 23", "Wed and Thu, Dec 23"]) expect(wrongWeekdays(t, DEC), t).toEqual([]);
  });
  it("'Monday, Dec 22 and Friday, Dec 25': one returned (Monday); Friday is right", () => {
    expect(wrongWeekdays("Monday, Dec 22 and Friday, Dec 25", DEC)).toEqual([{ said: "Monday, Dec 22", date: "2026-12-22", is: "Tuesday" }]);
  });
  it("short and long spellings, with or without the ordinal, are read", () => {
    expect(wrongWeekdays("Weds, Dec 23", DEC)).toEqual([]);
    expect(wrongWeekdays("Thurs, Dec. 24th", DEC)).toEqual([]);
    expect(wrongWeekdays("Mon, Dec. 24th", DEC)).toEqual([{ said: "Mon, Dec. 24th", date: "2026-12-24", is: "Thursday" }]);
  });
  it("a word that only looks like a weekday (the sun, they sat, they wed) is not one: a weekday starts with a capital", () => {
    for (const t of ["the morning sun, Jan 2 is the first", "where you sat Dec 20", "they wed Dec 21", "sun Dec 22"]) {
      expect(wrongWeekdays(t, DEC), t).toEqual([]);
      expect(withoutWrongWeekdays(t, DEC), t).toBe(t);
    }
  });
  it("a day that is not a date (Feb 30), no trip dates and no text: nothing", () => {
    expect(wrongWeekdays("Monday, Feb 30", { start: "2027-01-20", end: "2027-03-01" })).toEqual([]);
    expect(wrongWeekdays("Monday, Dec 22", { start: "", end: "" })).toEqual([]);
    expect(wrongWeekdays("", DEC)).toEqual([]);
  });
});

describe("withoutWrongWeekdays", () => {
  it("takes out the wrong weekday, its comma and its space, and nothing else", () => {
    expect(withoutWrongWeekdays("The night of Monday, Dec 22 is at Stay A.", DEC)).toBe("The night of Dec 22 is at Stay A.");
  });
  it("leaves a right weekday, a skipped one and every other word as written", () => {
    const t = "Monday, Dec 22 and Friday, Dec 25 (Wed–Thu, Dec 23–24), Saturday, July 4.";
    expect(withoutWrongWeekdays(t, DEC)).toBe("Dec 22 and Friday, Dec 25 (Wed–Thu, Dec 23–24), Saturday, July 4.");
  });
  it("text with nothing wrong comes back identical", () => {
    expect(withoutWrongWeekdays("Tuesday, Dec 22: Stay A.", DEC)).toBe("Tuesday, Dec 22: Stay A.");
  });
});
