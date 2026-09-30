import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";

const sections = [
  {
    id: "quick-start",
    title: "Quick Start",
    body: `Wander shows Larisa's Guide — her trip spreadsheet — on your phone, arranged by day.

**Home** opens on what matters now: today, where you sleep tonight, tomorrow, and any deadlines coming up. Tap any day on the calendar to see that day.

Along the bottom: **Ideas** (Larisa's ideas, city by city), **Now** (today, with what's next), **Actions** (deadlines and to-dos), and **Scout** — ask it anything about the trip.`,
  },
  {
    id: "getting-in",
    title: "Getting In",
    body: `The first time, point your iPhone's camera at the code Ken or Larisa shows you (or open the link they sent). In Safari, tap Share, then **Add to Home Screen** — Wander gets its own icon. Open it, then tap **Set up Face ID**. After that, just look at your phone.

New phone? Ask Ken or Larisa — they make a new invite from **Settings → People on this trip**. Once you've set up Face ID, your old link stops working, so an old message can't be used by anyone else.

Letting someone in (Ken and Larisa): **People on this trip → + Add someone**. Type their name, pick the trip, and show them the code.`,
  },
  {
    id: "getting-around",
    title: "A Day",
    body: `A day shows everything Larisa's Guide says for that date, in time order: flights, meetings, tours, meals, check-ins and check-outs, deadlines, and where everyone sleeps that night. Each line says where in the Guide it came from, and the bottom says when Wander last read the Guide.

When Larisa wrote a detailed plan for the day, **Larisa's plan for the day** comes next, in her order and with her times. When the group splits up, each line says who it's for. Where she lists a few places for one time, tap **We're going here** on the one you choose. Everyone sees it as the group's pick, and her Guide stays as she wrote it.

The arrows at the top move a day at a time. **‹ Back** goes back where you came from.

**+ Add a plan for this day** puts your own plan on it — "Ken and Andy: Musée Tomo at 3." Everyone sees it, marked as added in Wander. **Tell Larisa** sends it to her as a message, already written.`,
  },
  {
    id: "travel-days",
    title: "Now",
    body: `The **Now** tab is today: where Larisa's plan has you right now, what's next, and how long until it. Tap a place for directions in Maps. Quick Japanese phrases are there too.

Before the trip, Now shows the first day. After it, the last.`,
  },
  {
    id: "chat",
    title: "Scout — Your Travel Companion",
    body: `Scout has read the whole Guide, including the pasted emails and booking screenshots, and knows what day and time it is where you are. It answers from the Guide first and tells you so. If the Guide doesn't have something, Scout says that. It can also look things up online. It never changes the plan.

_"Where are we sleeping tonight?"_
_"What time is dinner, and what should I wear?"_
_"Any deadlines this week?"_
_"How long to Kansai airport from here?"_

You can type, tap a question, or tap the microphone and talk.`,
  },
  {
    id: "the-guide",
    title: "Where the Plan Lives",
    body: `Larisa's Guide is the plan. Wander reads a copy of it and never changes it. Where the Guide still has an open question — two hotels for one night, a "maybe" day trip — Wander shows it as open.

If something in Wander looks different from what Larisa told you, trust Larisa. Wander may not have read her latest version yet.`,
  },
  {
    id: "notes",
    title: "Ideas and Your Own Notes",
    body: `**Ideas** shows the ideas in Larisa's Activities tab, starting with the city you're in, with who marked each one. On any idea: **+ Note** (for everyone, or just for you), **Add to a day**, Maps, and Ask Scout. Larisa's Guide stays as it is.`,
  },
  {
    id: "no-signal",
    title: "No Signal",
    body: `Wander keeps a copy of the trip on your phone. With no signal, it shows that copy and says when it was saved. Scout needs a signal to answer.`,
  },
  {
    id: "travel-info",
    title: "Your Travel Info",
    body: `Tap your name at the top of Home for your Profile. Passport, visa and insurance details go in your vault, which opens with Face ID. Scout never reads those out.`,
  },
  {
    id: "feedback",
    title: "Making Wander Work Better for You",
    body: `Wander was just born. And Claude seems to make most additions and changes possible. So if you want anything new or different, tell Ken. And he will try. And he will pray.`,
  },
];

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.trim() === "") return <br key={i} />;
    const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j} className="font-medium text-[#3a3128]">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("_") && part.endsWith("_")) {
        return <em key={j} className="text-[#6b5d4a] not-italic">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={j} className="px-1 py-0.5 bg-[#f0ece5] rounded text-xs">{part.slice(1, -1)}</code>;
      }
      return <span key={j}>{part}</span>;
    });
    return <p key={i} className="mb-2 last:mb-0">{rendered}</p>;
  });
}

export default function GuidePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scrolledRef = useRef(false);
  useKeyboardShortcuts();

  useEffect(() => {
    if (scrolledRef.current) return;
    const hash = location.hash?.replace("#", "");
    if (hash) {
      scrolledRef.current = true;
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-20">
      <div className="max-w-lg mx-auto px-4 py-6 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate("/")}
            className="min-h-[44px] px-1 text-sm text-[#6b5d4a] hover:text-[#3a3128] transition-colors"
          >
            &larr; Home
          </button>
        </div>

        <h1 className="text-2xl font-light text-[#3a3128] mb-1">Wander</h1>
        <p className="text-sm text-[#6b5d4a] mb-8">Our trip, in one place</p>

        {/* Cards */}
        <div className="space-y-4">
          {sections.map((section, i) => (
            <div
              key={i}
              id={section.id}
              className={`rounded-xl border border-[#e5ddd0] p-5 scroll-mt-4 ${
                i === 0 ? "bg-[#514636] text-[#faf8f5]" : "bg-white"
              }`}
            >
              <h2
                className={`text-sm font-medium mb-3 ${
                  i === 0 ? "text-[#e0d8cc]" : "text-[#6b5d4a]"
                }`}
              >
                {section.title}
              </h2>
              <div
                className={`text-sm leading-relaxed ${
                  i === 0 ? "text-[#faf8f5]/90 [&_strong]:text-[#faf8f5] [&_em]:text-[#e0d8cc]" : "text-[#6b5d4a] [&_em]:text-[#6b5d4a]"
                }`}
              >
                {renderMarkdown(section.body)}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2.5 bg-[#514636] text-white rounded-xl text-sm font-medium hover:bg-[#3a3128] transition-colors"
          >
            Go to the trip
          </button>
        </div>
      </div>
    </div>
  );
}
