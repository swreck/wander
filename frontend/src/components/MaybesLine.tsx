/**
 * One quiet line on Home when someone else put out a maybe (or said something on one) since you last looked at that
 * city's list (Maybes, Oct 2 2026) — "Andy has a maybe for Tokyo: “tea or ice cream?” ›". Tapping opens that list.
 * No alerts; nothing at all when there's nothing new.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { loadMaybeNews, firstOf, type MaybeItem } from "../lib/maybesNews";

export default function MaybesLine({ tripId }: { tripId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const me = user?.displayName || null;
  const [news, setNews] = useState<{ latest: MaybeItem; more: number } | null>(null);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    const look = () => loadMaybeNews(tripId, me)
      .then((n) => {
        if (!alive) return;
        setNews(n.latest ? { latest: n.latest, more: n.items.length - 1 } : null);
        // (the tab's dot hears it too — on a first sign-in the bar didn't know the trip yet)
        window.dispatchEvent(new CustomEvent("wander:maybes-news", { detail: { count: n.items.length } }));
      })
      .catch(() => { /* no signal: say nothing */ });
    look();
    window.addEventListener("wander:maybes-changed", look);
    window.addEventListener("focus", look);
    return () => { alive = false; window.removeEventListener("wander:maybes-changed", look); window.removeEventListener("focus", look); };
  }, [tripId, me]);

  if (!news) return null;
  const { latest, more } = news;
  const who = firstOf(latest.by);
  const words = latest.words.length > 70 ? `${latest.words.slice(0, 68).trimEnd()}…` : latest.words;
  return (
    <button onClick={() => navigate(`/ideas?city=${latest.cityId}`)}
      className="w-full text-left mb-3 min-h-[44px] px-3 py-2 rounded-lg bg-white border border-[#e0d8cc] text-sm text-[#514636]">
      {latest.kind === "maybe" ? <>{who} has a maybe{latest.city ? ` for ${latest.city}` : ""}: “{words}”</> : <>{who} said something about “{words}”</>}
      {more > 0 && <span className="text-[#6b5d4a]"> · and {more} more</span>} ›
    </button>
  );
}
