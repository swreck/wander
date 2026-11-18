import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor } from "../lib/guideDisplay";
import { showMeAround } from "../components/ShowMeAround";
import { sectionsFor } from "../lib/helpSections";
import { isPlanTrip, planSourcesOf } from "../lib/planTrip";


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
  // To Larisa herself: "your Guide", "your ideas" (round 13: her own Help page said "Larisa's Guide — her trip spreadsheet")
  const me = useAuth().user?.displayName || null;
  // (a trip built from a plan has its own words: no Guide, no sheet — S2d)
  const sections = sectionsFor(voiceFor(me).mine, me || "", isPlanTrip(), planSourcesOf());

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
            onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"))}
            aria-label="Back"
            className="min-h-[44px] min-w-[44px] px-1 text-sm text-[#514636]"
          >
            ‹ Back
          </button>
        </div>

        <h1 className="text-2xl font-light text-[#3a3128] mb-1">Wander</h1>
        <p className="text-sm text-[#6b5d4a] mb-4">Our trip, in one place</p>
        {/* The short version: the buttons along the bottom, one at a time (Oct 2) */}
        <button onClick={showMeAround} className="mb-8 min-h-[44px] px-4 rounded-lg border border-[#e0d8cc] bg-white text-sm text-[#514636]">
          Show me around ›
        </button>

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
            className="px-6 py-2.5 min-h-[44px] bg-[#514636] text-white rounded-xl text-sm font-medium hover:bg-[#3a3128] transition-colors"
          >
            Go to the trip
          </button>
        </div>
      </div>
    </div>
  );
}
