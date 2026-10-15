/**
 * The trip's story, so far (Oct 15 2026). The March page counted "experiences", which the trip with Larisa's Guide
 * never had, so it called every day "A free day" and the trip "0 things done" — and Next links here at the trip's end.
 * Now it's the days lived, city by city: each day as her plan had it (Wander's summary, her stops with their photos),
 * the four's own words from Notes kept exactly, and a way to play the day again. No AI writing: the summaries Ken
 * wants from notes come after the trip (memory: trip notes and summaries).
 *
 * Whose notes: your own, all of them; someone else's only when they shared it with the trip and haven't said no to
 * trip stories; never Scout's own answers kept in Notes.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { guideData, type TripGuideData, type GuideItem } from "../lib/guideData";
import { daySummaries } from "../lib/daySummaries";
import { placePhotoUrl, type PlaceHit } from "../lib/placePhotos";
import type { TripNote } from "../lib/tripNotes";
import { useCityBandPhoto } from "../components/CityArrival";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor, clock as clock12 } from "../lib/guideDisplay";
import { tripCountryOf } from "../lib/cityColors";

const japanToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
const ymd = (d: string | null | undefined) => String(d || "").slice(0, 10);
const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Stop = { id: string; title: string; hit: PlaceHit | null };
type StoryDay = { date: string; cityId: string | null; summary: string | null; stops: Stop[]; planCount: number; notes: TripNote[];
  /** her plan's lines in her words, for a day whose stops have no photos */
  planTitles: string[];
  /** her Itinerary tab's line for a day without a detailed plan */
  itinerary: string[] };

/** A city's days, under its own photo (the one behind its day band) */
function CitySection({ name, cityId, days, children }: { name: string; cityId: string | null; days: number; children: React.ReactNode }) {
  const photo = useCityBandPhoto(cityId, !!cityId);
  return (
    <section className="mb-10">
      <div className="relative overflow-hidden rounded-2xl h-[132px] mb-4 bg-[#e9e0d2]">
        {photo?.src && <img src={photo.src} alt="" className="absolute inset-0 w-full h-full object-cover motion-safe:animate-[fadeIn_.6s_ease-out]" />}
        <div className="absolute inset-0" style={{ background: photo?.src ? "linear-gradient(180deg, rgba(24,16,8,.15) 0%, rgba(24,16,8,.65) 100%)" : "none" }} />
        <div className={`absolute left-4 bottom-3 ${photo?.src ? "text-white [text-shadow:0_1px_4px_rgba(0,0,0,.5)]" : "text-[#3a3128]"}`}>
          <h2 className="text-2xl font-light leading-tight">{name}</h2>
          <p className="text-[13px] opacity-90">{days} day{days === 1 ? "" : "s"}</p>
        </div>
        {photo && (photo.place || photo.credit) && <p className="absolute right-3 bottom-1 text-[10px] text-white/75 max-w-[55%] truncate">{[photo.place, photo.credit].filter(Boolean).join(" · ")}</p>}
      </div>
      {children}
    </section>
  );
}

export default function TripStoryPage() {
  const navigate = useNavigate();
  const myName = useAuth().user?.displayName || null;
  const [data, setData] = useState<TripGuideData | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [places, setPlaces] = useState<{ query: string; line: string; hit: PlaceHit | null }[]>([]);
  const [notes, setNotes] = useState<TripNote[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let id: string | null = null;
        try { id = localStorage.getItem("wander:last-trip-id"); } catch { /* none */ }
        if (!id) id = (await api.get<{ id?: string } | null>("/trips/active"))?.id || null;
        if (!id) { if (live) setState("none"); return; }
        const tid = id;
        const [d, s, p, n] = await Promise.all([
          guideData(tid),
          daySummaries(tid).catch(() => ({} as Record<string, string>)),
          api.get<{ places: { query: string; line: string; hit: PlaceHit | null }[] }>("/place-photos/known").catch(() => ({ places: [] })),
          // (the server decides whose notes a story may show — routes/tripNotes /story)
          api.get<TripNote[]>(`/trip-notes/trip/${tid}/story`).catch(() => [] as TripNote[]),
        ]);
        if (!live) return;
        setData(d); setSummaries(s || {}); setPlaces(p?.places || []); setNotes(Array.isArray(n) ? n : []);
        try { setMe(JSON.parse(localStorage.getItem("wander_me") || "null")?.travelerId || null); } catch { /* none */ }
        setState("ready");
      } catch { if (live) setState("none"); }
    })();
    return () => { live = false; };
  }, []);

  const today = japanToday();
  const story = useMemo(() => {
    if (!data) return null;
    const first = ymd(data.trip.startDate), last = ymd(data.trip.endDate);
    const until = last && today > last ? last : today;
    const lived = data.days.map((d) => ({ ...d, date: ymd(d.date) })).filter((d) => d.date >= first && d.date <= until).sort((a, b) => a.date.localeCompare(b.date));
    // her stop's photo: the place Wander found for that line (by her words; her tab's stop name rides along)
    const hitFor = (b: GuideItem) => places.find((x) => x.line === b.title || x.line.startsWith(`${b.title} (her tab names the stop:`))?.hit || null;
    const shown = notes.filter((n) => n.source !== "scout-answer");
    const days: StoryDay[] = lived.map((d) => {
      const plan = data.items.filter((i) => i.kind === "block" && ymd(i.date) === d.date).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const seen = new Set<string>();
      const stops = plan.map((b) => ({ id: b.id, title: b.title.replace(/^./, (c) => c.toUpperCase()), hit: hitFor(b) }))
        .filter((s) => s.hit && !seen.has(s.hit.id) && seen.add(s.hit.id));
      // (a plan whose stops have no photos is still her plan: its lines, in her words — not "a day without a plan")
      const planTitles = plan.map((b) => b.title.replace(/^./, (c) => c.toUpperCase())).filter((t) => t.length > 2);
      // (her Itinerary's lines, timed ones too, by the clock — tourist72: Oct 9's 8:45 AM Karatsu tour was left out)
      const itinerary = plan.length ? [] : data.items
        .filter((i) => ymd(i.date) === d.date && /itinerary/i.test(i.source) && !["deadline", "weather", "stop", "block"].includes(i.kind) && !/^see above\b/i.test(i.title))
        .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"))
        .map((i) => `${i.time ? `${clock12(i.time)} · ` : ""}${i.title}`).slice(0, 4);
      return {
        date: d.date, cityId: d.cityId || null, summary: summaries[d.date] || null, stops, planCount: plan.length, planTitles, itinerary,
        notes: shown.filter((n) => ymd(n.dayDate) === d.date).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      };
    });
    // city by city, in the order they were lived
    const sections: { cityId: string | null; name: string; days: StoryDay[] }[] = [];
    for (const day of days) {
      const last = sections[sections.length - 1];
      if (last && last.cityId === day.cityId) last.days.push(day);
      else sections.push({ cityId: day.cityId, name: data.trip.cities?.find((c) => c.id === day.cityId)?.name || "On the way", days: [day] });
    }
    // (the trip's country's cities — "6 cities" counted San Francisco; and no count of photos as "stops": tourist72)
    const country = tripCountryOf(data.trip.cities || []);
    const cities = new Set(days.map((d) => d.cityId).filter((id) => { const c = data.trip.cities?.find((x) => x.id === id); return !!c && (!country || !c.country || c.country === country); })).size;
    return { sections, days, first, last, over: !!last && today > last, cities, country, notes: days.reduce((n, d) => n + d.notes.length, 0) };
  }, [data, summaries, places, notes, me, today]);

  if (state === "loading") return <div className="min-h-screen flex items-center justify-center text-[#6b5d4a] bg-[#faf8f5]">Gathering your story…</div>;
  if (!data || !story) return <div className="min-h-screen flex items-center justify-center text-[#6b5d4a] bg-[#faf8f5] px-6 text-center">Your trip's story needs a moment of signal to gather.</div>;

  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"));
  // ("Larisa's plan" — "Your plan" to Larisa)
  const v = voiceFor(myName);
  return (
    <div className="min-h-screen bg-[#faf8f5] pb-24">
      <header className="relative bg-[#3a3128] text-white px-5 pb-8 text-center" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <button type="button" onClick={back} className="absolute left-3 min-h-[44px] px-2 text-white/75 text-sm" style={{ top: "calc(env(safe-area-inset-top, 0px) + 4px)" }}>‹ Back</button>
        <p className="text-[12px] uppercase tracking-[.16em] text-white/60 mt-9">{story.over ? "The story of the trip" : "The story so far"}</p>
        <h1 className="text-[28px] font-light mt-1 leading-tight">{data.trip.name}</h1>
        {story.first && story.last && <p className="text-sm text-white/65 mt-1">{shortDay(story.first)} – {shortDay(story.last)}</p>}
        {/* (tourist73: "with yours" was wrong once others' shared notes show, and read "your plan, with yours" to Larisa) */}
        {story.days.length > 0 && (
          <p className="text-[12px] text-white/55 mt-3">Each day as Wander sums up {v.owners} plan, and notes as their writers wrote them</p>
        )}
        {story.days.length > 0 && (
          <p className="text-sm text-white/85 mt-2">
            {story.days.length} day{story.days.length === 1 ? "" : "s"}{story.cities ? ` · ${story.cities} ${story.cities === 1 ? "city" : "cities"}${story.country ? ` in ${story.country}` : ""}` : ""}{story.notes ? ` · ${story.notes} note${story.notes === 1 ? "" : "s"}` : ""}
          </p>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 pt-6">
        {story.days.length === 0 && (
          <p className="text-center text-sm text-[#6b5d4a] py-12">{story.first ? `The story starts on ${longDay(story.first)}.` : "The story starts with the trip's first day."}</p>
        )}
        {story.sections.map((sec, si) => (
          <CitySection key={`${sec.cityId}-${si}`} name={sec.name} cityId={sec.cityId} days={sec.days.length}>
            {sec.days.map((d) => (
              <article key={d.date} className="mb-6 pl-4 border-l-2 border-[#e0d8cc]">
                <h3 className="text-[15px] font-medium text-[#3a3128]">{longDay(d.date)}</h3>
                {d.summary && <p className="text-[15px] leading-relaxed text-[#3a3128] mt-1">{v.say(d.summary)}</p>}
                {d.stops.length > 0 && (
                  <div className="flex gap-2.5 overflow-x-auto mt-3 pb-1 -mr-4 pr-4">
                    {d.stops.map((s) => (
                      <figure key={s.id} className="shrink-0 w-[132px]">
                        <img src={placePhotoUrl(s.hit!, 0, true)} alt="" loading="lazy" className="w-[132px] h-[96px] rounded-lg object-cover bg-[#efe8dc]" />
                        <figcaption className="text-[12px] text-[#514636] mt-1 leading-snug line-clamp-2">{s.title}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {!d.stops.length && d.planTitles.length > 0 && (
                  <p className="text-[14px] text-[#514636] mt-1.5">{v.Owners} plan: {d.planTitles.slice(0, 5).join(" · ")}{d.planTitles.length > 5 ? ` · and ${d.planTitles.length - 5} more` : ""}</p>
                )}
                {!d.summary && !d.planTitles.length && (d.itinerary.length
                  ? <div className="mt-1"><p className="text-[12px] text-[#6b5d4a]">In {v.her} Itinerary</p>{d.itinerary.map((t) => <p key={t} className="text-[14px] text-[#514636]">{t}</p>)}</div>
                  : <p className="text-[14px] text-[#6b5d4a] mt-1">A day without a detailed plan in {v.her} Guide.</p>)}
                {d.notes.map((n) => (
                  <blockquote key={n.id} className="mt-3 rounded-xl bg-white border border-[#e0d8cc] px-3.5 py-2.5">
                    <p className="text-[15px] text-[#3a3128] whitespace-pre-line">{n.text}</p>
                    <footer className="text-xs text-[#6b5d4a] mt-1">{n.mine || n.travelerId === me ? "You" : n.authorName} · {new Date(n.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Tokyo" })}</footer>
                  </blockquote>
                ))}
                <div className="flex gap-4 mt-2">
                  {d.planCount >= 2 && <button type="button" onClick={() => navigate(`/day/${d.date}#play-${d.date}`)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">▶ Play the day</button>}
                  <button type="button" onClick={() => navigate(`/day/${d.date}`)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Open the day ›</button>
                </div>
              </article>
            ))}
          </CitySection>
        ))}
        {story.over && <LearningPrompt tripId={data.trip.id} />}
      </main>
    </div>
  );
}

function LearningPrompt({ tripId }: { tripId: string }) {
  const { showToast } = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveLearning() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.post("/learnings", { tripId, content: text.trim(), source: "dedicated", visibility: "group" });
      setSaved(true);
      showToast("Thanks — that'll help next time");
    } catch {
      showToast("That didn't save — try again?", "error");
    } finally {
      setSaving(false);
    }
  }

  if (saved) return <p className="mt-8 mb-4 text-center text-sm text-[#6b5d4a]">Noted — that'll come in handy next time</p>;
  return (
    <div className="mt-8 mb-4 p-4 bg-[#f0ece5] rounded-xl">
      <p className="text-sm font-medium text-[#3a3128] mb-2">Anything you'd do differently?</p>
      <p className="text-xs text-[#6b5d4a] mb-3">Skip a place, change the order, pack something different — anything future-you should know.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Next time I'd..." rows={3}
        className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-[16px] text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880] resize-y" />
      <button onClick={saveLearning} disabled={saving || !text.trim()}
        className="mt-2 min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm font-medium hover:bg-[#3a3128] disabled:opacity-40 transition-colors">
        {saving ? "Saving..." : "Save this learning"}
      </button>
    </div>
  );
}
