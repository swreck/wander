import { planSourceNames } from "./guideDisplay";

// Each paragraph that speaks of Larisa has her own version, written as sentences — to Larisa it's "your Guide"
// (round 13: swapping her name for "you" by rule produced "Ask you or Ken" and "your Guide is the plan." mid-text)
const sheetSections = (mine: boolean, meName: string) => [
  {
    id: "quick-start",
    title: "Quick Start",
    body: `${mine ? "Wander shows your Guide, your trip spreadsheet, on your phone, arranged by day." : "Wander shows Larisa's Guide, her trip spreadsheet, on your phone, arranged by day."}

**Home** opens on what matters now. Under the trip's dates is today's weather, and **Go to today ›** opens today's full page. Below that: today, where you sleep tonight, tomorrow, and any deadlines coming up. Tap any day on the calendar to see that day.

Along the bottom: **Today** (all of today: ${mine ? "your" : "Larisa's"} plan by the clock, its places, Play the day), **Next** (what's next today, when, and how to get there), **Notes** (what you want to remember, every word kept), **Budget** (what each couple has paid for the group, and who pays next: KL for Ken & Larisa, AJ for Julie & Andy, as Budget names them), and **Scout**, which you can ask anything about the trip. **日 Phrases** at the right end opens Japanese phrases. To-dos and deadlines, and **Maybes**, open from Home.`,
  },
  {
    id: "getting-around",
    title: "A Day",
    body: mine
      ? `A day shows everything your Guide says for that date, in time order: flights, meetings, tours, meals, check-ins and check-outs, deadlines, and where everyone sleeps that night. Each line says where in your Guide it came from, and the bottom says when Wander last read it.

Near the top is the weather where you sleep that night. More than a week away, it's an early outlook.

When you wrote a detailed plan for the day, **Your plan for the day** comes next, in your order and with your times. When the group splits up, each line says who it's for. Where you list a few places for one time, anyone can tap **We're going here** on the one they choose. Everyone sees it as the group's pick, and your Guide stays as you wrote it.

The arrows at the top move a day at a time. **‹ Back** goes back where you came from.

**+ Add a plan for this day** puts a plan of your own on it, like "Ken and Andy: Musée Tomo at 3." Everyone sees it, marked as added in Wander, and your Guide doesn't change.`
      : `A day shows everything Larisa's Guide says for that date, in time order: flights, meetings, tours, meals, check-ins and check-outs, deadlines, and where everyone sleeps that night. Each line says where in the Guide it came from, and the bottom says when Wander last read the Guide.

Near the top is the weather where you sleep that night. More than a week away, it's an early outlook.

When Larisa wrote a detailed plan for the day, **Larisa's plan for the day** comes next, in her order and with her times. When the group splits up, each line says who it's for. Where she lists a few places for one time, tap **We're going here** on the one you choose. Everyone sees it as the group's pick, and her Guide stays as she wrote it.

The arrows at the top move a day at a time. **‹ Back** goes back where you came from.

**+ Add a plan for this day** puts your own plan on it, like "Ken and Andy: Musée Tomo at 3." Everyone sees it, marked as added in Wander. **Tell Larisa** sends it to her as a message, already written.`,
  },
  {
    id: "travel-days",
    title: "Next",
    body: `The **Next** tab is today: where ${mine ? "your" : "Larisa's"} plan has you right now, what's next, and how long until it. Under it, **Get there** opens Google Maps from where you're standing: walking, by train, or a route to show a taxi driver.

Before the trip, Next shows the first day. After it, the last.`,
  },
  {
    id: "phrases",
    title: "Japanese Phrases",
    body: `Tap **日 Phrases** at the right end of the bar along the bottom, on any screen. The card has the phrases you'll use most, like "Excuse me" and "Check, please", with how to say each one. Ask Scout how to say something and it's added to the card for everyone, first on yours.

**Edit** on the card puts the phrases in your order (↑ and ↓) and takes off the ones you don't need. Your order is yours alone. **Put back** brings back anything you removed.`,
  },
  {
    id: "chat",
    title: "Scout, Your Travel Companion",
    body: `Scout has read the whole Guide, including the pasted emails and booking screenshots, and knows what day and time it is where you are. It answers from the Guide first and tells you so. If the Guide doesn't have something, Scout says that. It can also look things up online. It never changes the plan.

_"Where are we sleeping tonight?"_
_"What time is dinner, and what should I wear?"_
_"Any deadlines this week?"_
_"Anywhere for coffee near here?"_

You can type, tap a question, or tap the microphone and talk. Tap it again when you're done, and your words wait in the box until you send them.

Send Scout a photo or a file, like a menu, a sign, a ticket or a PDF: tap the paperclip, or paste it into the box. Ask it to keep a receipt or a ticket, and it goes in your Notes under the day it belongs to.

When Scout needs to know where you are, tap **Use my location** under its answer. Under every answer are **Copy** and **Read aloud**.

Scout sees only the last few messages of today's conversation. To keep an answer, like a list of breakfast places, say "remember that": it goes in your Notes, marked "kept from Scout". Later, any day, ask "What was that list?" or "Bring back what we talked about" and Scout finds it in your Notes. Telling Scout something works the same way: "Remember that the food hall closes at 8."`,
  },
  {
    id: "the-guide",
    title: "Where the Plan Lives",
    body: mine
      ? `Your Guide is the plan. Wander reads a copy of it and never changes it. Where your Guide still has an open question, like two hotels for one night or a "maybe" day trip, Wander shows it as open.

If you've changed something lately, Wander may not have read your latest version yet. The bottom of each day says when it last did.

Trains come from a second place: Ken's rail sheet, which he keeps with AI help. A day's "Trains" part shows its bookings, with seats, reservation numbers and its own notes, and the ticket pickup at Shin-Osaka has its own step-by-step page. Wander reads that sheet every few minutes and never changes it. Where it and your Guide disagree, Wander shows both.`
      : `Larisa's Guide is the plan. Wander reads a copy of it and never changes it. Where the Guide still has an open question, like two hotels for one night or a "maybe" day trip, Wander shows it as open.

If something in Wander looks different from what Larisa told you, trust Larisa. Wander may not have read her latest version yet.

Trains come from a second place: ${/^ken$/i.test(meName) ? "your rail sheet, which you keep" : "Ken's rail sheet, which he keeps"} with AI help. A day's "Trains" part shows its bookings, with seats, reservation numbers and its own notes, and the ticket pickup at Shin-Osaka has its own step-by-step page. Wander reads that sheet every few minutes and never changes it. Where it and Larisa's Guide disagree, Wander shows both.`,
  },
  {
    id: "notes",
    title: "Maybes and Your Own Notes",
    body: `**Maybes** (on Home) is the group's shared list of "maybe we should…", city by city, starting with the city you're in. Write a few words in the box at the top (paste a link if there is one) and tap **Send**: everyone on the trip sees it, and **Tell the group** sends it to your group text too. ${mine ? "Your" : "Larisa's"} ideas from ${mine ? "your" : "her"} Activities tab are below the group's. On anything: **I'm in**, **Say something** (for everyone, or just for you), **Add to a day**, and Ask Scout. "Interested" shows everyone who's in, from ${mine ? "your" : "her"} X marks and from Wander together. A line on Home says when there's something new. ${mine ? "Your" : "Larisa's"} Guide stays as it is.

**Notes** keeps what you want to remember of the trip, every word as you type or say it, on the day it's about. Only you see a note unless you share it with the trip. You can also tell Scout what happened ("we came here because our guide drove us, so we saw Arita too"), and it keeps your words in your Notes for that day.

To write about another day, choose it under **Day**, or tap **+ Add a note for this day** on that day's page, or tell Scout which day it's about.

Choose **Everyone's**, **Mine**, **Others'** or **Scout** to see whose notes. **Export mine** saves your notes as a text file, with or without what Scout kept for you.

**Keep a paper**, under the writing box in Notes, keeps a photo of a receipt, a ticket or a booking on the day it belongs to, so you needn't carry the paper. ${mine ? "Ken sees yours, and you see his." : /^ken$/i.test(meName) ? "Larisa sees yours, and you see hers." : "Only you see yours."} Tap one to see it full screen, pinch to zoom in, and choose who sees it. Share one with everyone, a hotel's welcome sheet say, and the others see a card about it the next time they open Wander.`,
  },
  {
    id: "no-signal",
    title: "No Signal",
    body: `Wander keeps a copy of the trip on your phone. With no signal, it shows that copy and says when it was saved. Scout needs a signal to answer.`,
  },
  {
    id: "travel-info",
    title: "Your Travel Info",
    body: `Tap your name at the top of Home for your Profile. Passport, visa and insurance details go in your vault, which opens with a PIN you choose (or Face ID). No one else sees those details, and Scout never reads them out.`,
  },
  {
    id: "feedback",
    title: "Making Wander Work Better for You",
    body: `Wander was just born. And Claude seems to make most additions and changes possible. So if you want anything new or different, tell Ken. And he will try. And he will pray.`,
  },
  // (last: everyone reading this is already in — Ken, Oct 13: "They are in now and can't read it unless they are in
  // already!" What's left is a new phone, and letting someone else in)
  {
    id: "getting-in",
    title: "A New Phone, or Someone New",
    body: mine
      ? `A new phone of your own? Make a new invite from **Settings → People on this trip**, or ask Ken to. Once Face ID is set up on the new phone, the old link stops working, so an old message can't be used by anyone else.

Letting someone in: **Settings → People on this trip → + Add someone**. Type their name, pick the trip, and show them the code. Their iPhone's camera opens it in Safari, where they tap **Let's go** and set up Face ID, and Wander shows them how to put it on their Home Screen.`
      : `A new phone? Ask Ken or Larisa for a new invite; they make it from **Settings → People on this trip**. Once Face ID is set up on the new phone, your old link stops working, so an old message can't be used by anyone else.

${/^ken$/i.test(meName) ? "Letting someone in" : "Letting someone in (Ken and Larisa)"}: **Settings → People on this trip → + Add someone**. Type their name, pick the trip, and show them the code. Their iPhone's camera opens it in Safari, where they tap **Let's go** and set up Face ID, and Wander shows them how to put it on their Home Screen.`,
  },
];

/** "A, B and C" */
const joined = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * The help page on a trip built from a plan (S2d, Nov 17 2026). Sections and order as a sheet trip's; the paragraphs that
 * say "Guide", "sheet", "tab" or "Larisa's plan" are the plan's words, and every other paragraph is today's, word for word.
 */
const planSections = (mine: boolean, meName: string, sources: string[]) => {
  const sheet = sheetSections(mine, meName);
  const named = planSourceNames(sources, meName);
  const paragraphs = (id: string) => sheet.find((s) => s.id === id)!.body.split("\n\n");
  const lives = named.length
    ? `The plan is built from ${joined(named)}. Wander never changes ${named.length === 1 ? "it" : named.length === 2 ? "either" : "any of them"}. Where something is still open, Wander shows it as open.`
    : "Wander holds the trip's plan. Where something is still open, Wander shows it as open.";
  const bodies: Record<string, string> = {
    "quick-start": `Wander shows the trip's plan on your phone, arranged by day.

**Home** opens on what matters now. **Go to today ›** opens today's full page. Below that: today, where you sleep tonight, and tomorrow. Tap any day on the calendar to see that day.

Along the bottom: **Today** (all of today, by the clock), **Next** (what's next today, when, and how to get there), **Notes** (what you want to remember, every word kept), **Budget** (what's been paid for the group, and who pays next), and **Scout**, which you can ask anything about the trip. **Phrases** at the right end opens a card of phrases for the country you're in. To-dos and **Maybes** open from Home.`,
    "getting-around": `A day shows everything the plan has for that date, in time order: flights, meetings, tours, meals, check-ins and check-outs, and where you sleep that night. Each line says where it came from, and the bottom says when the plan was last updated.

The arrows at the top move a day at a time. The word at the top left, like **‹ Home**, goes back where you came from.

**+ Add a plan for this day** puts your own plan on it, like "Ken and Larisa: the night market at 7." Everyone sees it, marked as added in Wander.`,
    "travel-days": `The **Next** tab is today: where the plan has you right now, what's next, and how long until it. Under it, **Walk** and **Taxi** open Google Maps from where you're standing. In Japan there is **Train** as well.

Before the trip, Next shows the first day. After it, the last.`,
    chat: [
      "Scout has read the whole plan and knows what day and time it is where you are. It answers from the plan first and tells you so. If the plan doesn't have something, Scout says that. It can also look things up online. It never changes the plan.",
      `_"Where are we sleeping tonight?"_
_"What time do we meet Backroads?"_
_"When do we land in Tokyo?"_
_"Anywhere for coffee near here?"_`,
      ...paragraphs("chat").slice(2),
    ].join("\n\n"),
    "the-guide": `${lives}

${mine ? "If something in Wander looks different from your notes, your notes are right. Wander may not have your latest yet." : "If something in Wander looks different from what Larisa told you, trust Larisa. Wander may not have her latest yet."}`,
    notes: [
      `**Maybes** (on Home) is the group's shared list of "maybe we should…", city by city, starting with the city you're in. Write a few words in the box at the top (paste a link if there is one) and tap **Send**: everyone on the trip sees it, and **Tell the group** sends it to your group text too. On anything: **I'm in**, **Say something** (for everyone, or just for you), **Add to a day**, and Ask Scout. "Interested" shows everyone who's in. A line on Home says when there's something new.`,
      paragraphs("notes")[1].replace("we came here because our guide drove us, so we saw Arita too", "our guide took us to her family's noodle shop"),
      ...paragraphs("notes").slice(2),
    ].join("\n\n"),
  };
  // (the phrase card is for the country you're in: its section is "Phrases", and the button has no 日)
  const phrases = sheet.find((s) => s.id === "phrases")!.body.replace("Tap **日 Phrases** at the right end", "Tap **Phrases** at the right end");
  return sheet.map((s) => (s.id === "phrases" ? { ...s, title: "Phrases", body: phrases } : bodies[s.id] ? { ...s, body: bodies[s.id] } : s));
};

/** The help page's sections: a sheet trip's as they have always been, a trip built from a plan with the plan's words */
export const sectionsFor = (mine: boolean, meName: string, plan = false, sources: string[] = []) => (plan ? planSections(mine, meName, sources) : sheetSections(mine, meName));
