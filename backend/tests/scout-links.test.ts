/**
 * A link in Scout's answer must be one Scout saw (Oct 4 2026: Ken got a JR West link from memory — dead — and a
 * made-up page behind it). Seen = what Scout was given or found, never what it wrote itself. No database, no API.
 */
import { describe, it, expect } from "vitest";
import { linkKey, linksIn, unseenLinks, markUnseen, seenIn, LINK_CHECK_NOTE } from "../src/services/links.js";

describe("links in an answer", () => {
  it("finds plain and markdown links, without trailing punctuation", () => {
    expect(linksIn("Start here: https://www.westjr.co.jp/global/en/ticket/reservation/. Or [the menu](https://e5489.jr-odekake.net/e5489/ibsp/CBTopMenuSP?LANG=en).")).toEqual([
      "https://www.westjr.co.jp/global/en/ticket/reservation/",
      "https://e5489.jr-odekake.net/e5489/ibsp/CBTopMenuSP?LANG=en",
    ]);
  });
  it("the same address however it's written", () => {
    expect(linkKey("https://www.Example.com/a/")).toBe(linkKey("http://example.com/a"));
    expect(linkKey("https://example.com/a/?x=1")).toBe("example.com/a?x=1");
  });
});

describe("what counts as seen", () => {
  const search = { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://e5489.jr-odekake.net/e5489/ibsp/CBTopMenuSP?LANG=en", title: "Top Menu" }] };
  it("a search result or an opened page is seen; Scout's own earlier words are not", () => {
    const messages = [
      { role: "user", content: [{ type: "document", source: { type: "text", data: "SmartEX login: https://shinkansen2.jr-central.co.jp/RSV_P/S_smart_en_index.htm" } }] },
      { role: "assistant", content: "Start here: https://www.westjr.co.jp/global/en/ticket/reservation/" },
      { role: "assistant", content: [{ type: "text", text: "see https://made-up.example/page" }, search] },
    ];
    const seen = seenIn("system words", messages, []);
    expect(unseenLinks("https://shinkansen2.jr-central.co.jp/RSV_P/S_smart_en_index.htm", seen)).toEqual([]);
    expect(unseenLinks("https://e5489.jr-odekake.net/e5489/ibsp/CBTopMenuSP?LANG=en", seen)).toEqual([]);
    // (the dead link Scout wrote last time doesn't vouch for itself)
    expect(unseenLinks("https://www.westjr.co.jp/global/en/ticket/reservation/", seen)).toEqual(["https://www.westjr.co.jp/global/en/ticket/reservation/"]);
    expect(unseenLinks("https://made-up.example/page", seen)).toEqual(["https://made-up.example/page"]);
  });
  it("a link the person typed or sent counts; this check's own note never does", () => {
    const messages = [
      { role: "user", content: "is https://www.jrpass.com/ any good?" },
      { role: "user", content: [{ type: "text", text: `${LINK_CHECK_NOTE} a link you haven't seen in this conversation: https://made-up.example/page.` }] },
    ];
    const seen = seenIn("", messages, []);
    expect(unseenLinks("https://www.jrpass.com/", seen)).toEqual([]);
    expect(unseenLinks("https://made-up.example/page", seen)).toEqual(["https://made-up.example/page"]);
  });
  it("a page opened in this very step counts", () => {
    const fetched = { type: "web_fetch_tool_result", content: { url: "https://www.westjr.co.jp/global/en/howto/train-reservation/receive/" } };
    expect(unseenLinks("https://www.westjr.co.jp/global/en/howto/train-reservation/receive/", seenIn("", [], [fetched]))).toEqual([]);
  });
});

describe("a link Scout kept anyway", () => {
  it("is said plainly as unchecked", () => {
    expect(markUnseen("Go to https://made-up.example/page now.", ["https://made-up.example/page"]))
      .toBe("Go to https://made-up.example/page (Wander couldn't check this link — Scout didn't open it) now.");
  });
});
