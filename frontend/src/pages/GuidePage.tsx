import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";

const sections = [
  {
    id: "quick-start",
    title: "Quick Start",
    body: `Wander is where the trip lives — every city, day, restaurant and temple. Scout is your travel companion inside the app — ask questions, make changes, or just chat about what to do next.

Tap the link you were sent, pick your name, and you're in the trip overview. Tap a day to see its city and activities. Details are below.`,
  },
  {
    id: "getting-around",
    title: "Getting Around",
    body: `There are three main ways we move through the trip:

The **home screen** shows a calendar, where each cell is a day, color-coded by city. Tap any day to jump into the day-by-day plan.

The **day-by-day** shows that day's activities on the map with the full schedule alongside — reservations, accommodations, and notes. A scrollable strip of day cards runs along the bottom; swipe to move between days.

Above the day strip: **Home** (back to the overview), **Add** (capture a new place or import), and **Scout** (your travel companion). On a phone, there's also a **List** button to switch between the map and list views — on a larger screen, both are visible side by side.`,
  },
  {
    id: "chat",
    title: "Scout — Your Travel Companion",
    body: `The chat bubble in the bottom-right corner is Scout. Scout knows your whole trip — every city, day, reservation, and activity. You can ask questions, make changes, or just think out loud.

_"What's planned for Tuesday?"_
_"Add Fushimi Inari to the Kyoto days"_
_"How far is the hotel from the temple?"_
_"What are we doing in Osaka?"_

Scout also stores your travel info if you tell it: _"My Delta SkyMiles number is 1234567."_

Scout won't offer opinions on whether you'll love a place, and doesn't know things outside the trip data. If it misunderstands, just rephrase. You can type or tap the microphone and talk.`,
  },
  {
    id: "travel-days",
    title: "On Travel Days",
    body: `During the trip, a **Now** button appears on the home screen — it's your day-of command center. It shows what's next on today's schedule, calculates when you should leave based on where you are and how you're getting there, and gives you one-tap directions in Apple or Google Maps. If trains are disrupted, you'll see an alert.

Wander works offline too; changes sync when you're back on wifi or cellular.`,
  },
  {
    id: "shaping",
    title: "Shaping the Plan Together",
    body: `Other than an easy reference, a point of having a shared app is we can change or discuss shared days without a long text thread. Activities in black at the top are "sure things." Grey items at the bottom are options from the system or any of us. When you're browsing activities on a day, tap the **up arrow** (↑) next to any activity to promote it onto the day's schedule, then pick which day. Tap the **down arrow** (↓) to move something off the schedule and back to candidates. The map updates. Nothing is permanent, and everything can be moved back.

In the activity list, you may see a **Decide Together** section — that's the group choosing between options. Tap the one you'd pick, or tap "Happy with any" if you're flexible. When everyone's weighed in, someone taps **Resolve** to lock it in.

Found a place you want to add? Tell Scout — _"add Café Kitsune to Thursday"_ — or tap **+** then **Manual**. You'll get three choices: **Add to itinerary** (onto the schedule), **Just an idea** (save for later), or **Ask the group** (start a group decision with this as the first option).`,
  },
  {
    id: "browsing",
    title: "Browsing by Interest",
    body: `On the map, there's a column of filter buttons on the left — food, temples, nature, and more. Tap one to filter the map to just that category. Tap it again to show everything. Hold a button to see its label.`,
  },
  {
    id: "travel-info",
    title: "Your Travel Info",
    body: `Tap your name in the top-right corner of the home screen to reach your Profile. You can store passport numbers, frequent flyer details, insurance — anything useful during the trip. Mark items **private** (only you) or **shared** (the group can see them for coordinating bookings).`,
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
        return <em key={j} className="text-[#8a7a62] not-italic">{part.slice(1, -1)}</em>;
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
            className="text-sm text-[#8a7a62] hover:text-[#3a3128] transition-colors"
          >
            &larr; Back
          </button>
        </div>

        <h1 className="text-2xl font-light text-[#3a3128] mb-1">Wander</h1>
        <p className="text-sm text-[#a89880] mb-8">Our trip, in one place</p>

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
                  i === 0 ? "text-[#e0d8cc]" : "text-[#a89880]"
                }`}
              >
                {section.title}
              </h2>
              <div
                className={`text-sm leading-relaxed ${
                  i === 0 ? "text-[#faf8f5]/90 [&_strong]:text-[#faf8f5] [&_em]:text-[#e0d8cc]" : "text-[#6b5d4a] [&_em]:text-[#a89880]"
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
