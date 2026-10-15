/**
 * Ideas for Wander (Oct 15 2026) — a place apart from the trip, for Ken and Andy. Ken: "a place used most by andy and me
 * to place screenshots and ideas to improve wander… Should not get in the way of travel flow. Product focused only.
 * With all inputs durable and optimized to support planning. So ideally you or Scott are a participant"; "That one is
 * clearly a mode, one enters, so it should be easy and evident for Andy and me without conflicting with daily reference
 * use". Entered from "Ideas" at the top of Home (components/IdeasLink.tsx); nothing of it shows in the travel screens.
 *
 * Each idea keeps its words exactly, its screenshots, and a status (New, Talking, Planned, Built, Not now) — so the list
 * is the plan. Scout answers each new idea within seconds; Claude, Wander's engineer, answers in its working sessions.
 * What's being written is kept as a draft on this phone until it's posted.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ideasOf, ideasSeen, postIdea, setIdeaStatus, ideaPictureUrl, STATUS_WORDS, ENGINEER_LABEL, type Idea, type IdeaPost, type IdeaStatus } from "../lib/wanderIdeas";
import PictureViewer from "../components/PictureViewer";

const ORDER: IdeaStatus[] = ["new", "talking", "planned", "built", "not-now"];
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const draftKey = (k: string) => `wander:idea-draft:${k}`;
const readDraft = (k: string) => { try { return localStorage.getItem(draftKey(k)) || ""; } catch { return ""; } };
const writeDraft = (k: string, v: string) => { try { if (v) localStorage.setItem(draftKey(k), v); else localStorage.removeItem(draftKey(k)); } catch { /* private window */ } };

// (a screenshot shown as the phone screen it is — tall, its top showing — so the idea reads at a glance; Oct 15, Ken:
// "make the 'improve wander' function attractive so andy will be drawn to offering ideas")
const SHOT = "w-[108px] h-[192px] rounded-xl";

function Thumb({ id, who }: { id: string; who: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => { let live = true; ideaPictureUrl(id).then((u) => { if (live) setUrl(u); }); return () => { live = false; }; }, [id]);
  if (!url) return <span className={`block shrink-0 ${SHOT} bg-[#f0ebe3]`} aria-label="Loading a picture" />;
  return (
    <>
      <button type="button" onClick={() => setFull(true)} className={`block shrink-0 ${SHOT} overflow-hidden border border-[#e0d8cc] shadow-sm`} aria-label={`See ${who}'s picture full screen`}>
        <img src={url} alt="" className="w-full h-full object-cover object-top" />
      </button>
      {full && <PictureViewer src={url} alt={`A picture ${who} posted`} onClose={() => setFull(false)} />}
    </>
  );
}

/** The box for an idea or a reply: words, screenshots (chosen or pasted), Post */
// Ways to begin, so the box is never blank (a tap puts the words in and the cursor after them)
// (andy-ideas: "I loved this:" too — a photo moment he likes is an idea as much as a gripe)
const STARTERS = [["I wish Wander…", "I wish Wander "], ["I loved this:", "I loved this: "], ["This confused me:", "This confused me: "], ["More of this:", "More of this: "], ["This looks off:", "This looks off: "]];
// (a sparkle, not a bulb — the Maybes tab is a bulb)
const SPARKLE = "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z";

function Composer({ draftId, placeholder, button, onPost, autoFocus, invite }: {
  draftId: string; placeholder: string; button: string; autoFocus?: boolean;
  onPost: (words: string, files: File[]) => Promise<string | null>;
  /** the new-idea box: a screenshot first, ways to begin, how to take a screenshot */
  invite?: boolean;
}) {
  const [words, setWords] = useState(() => readDraft(draftId));
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => { writeDraft(draftId, words); }, [draftId, words]);
  useEffect(() => { if (!sent) return; const t = setTimeout(() => setSent(false), 4000); return () => clearTimeout(t); }, [sent]);
  const begin = (s: string) => {
    // (a second starter tapped before writing replaces the first — andy-ideas: "I wish Wander" was left dangling)
    const untouched = !words.trim() || STARTERS.some(([, t]) => t.trim() === words.trim());
    const next = untouched ? s : `${words.replace(/\s*$/, "")}\n${s}`;
    setWords(next);
    requestAnimationFrame(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(next.length, next.length); } });
  };
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setPreviews(u); return () => u.forEach((x) => URL.revokeObjectURL(x)); }, [files]);
  const add = (list: FileList | File[] | null) => {
    const pics = Array.from(list || []).filter((f) => f.type.startsWith("image/") || !f.type);
    // (six at most, said when more are chosen — verify62: a seventh vanished without a word)
    if (!pics.length) return;
    setTooMany(files.length + pics.length > 6);
    setFiles((old) => [...old, ...pics].slice(0, 6));
  };
  const send = async () => {
    if (busy || (!words.trim() && !files.length)) return;
    setBusy(true); setError(null);
    const err = await onPost(words.trim(), files);
    setBusy(false);
    if (err) { setError(err); return; }
    setWords(""); setFiles([]); setTooMany(false); writeDraft(draftId, "");
    setSent(true);
  };
  return (
    <div className="flex flex-col gap-2">
      {/* (the screenshot first, as big as the idea it carries — Andy thinks in pictures) */}
      {invite && !files.length && (
        <button type="button" onClick={() => input.current?.click()}
          className="w-full min-h-[96px] rounded-xl border-2 border-dashed border-[#d9c7a6] bg-[#fdf8f0] flex items-center gap-3.5 px-4 text-left active:bg-[#f8eedd]">
          <span className="shrink-0 w-11 h-[66px] rounded-lg border-2 border-[#c8a060] flex items-center justify-center text-[#a8783a]" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          <span>
            <span className="block text-[15px] font-medium text-[#3a3128]">Add a screenshot</span>
            <span className="block text-[13px] text-[#6b5d4a] mt-0.5">The screen you’d change. Your newest photo is on top.</span>
          </span>
        </button>
      )}
      {invite && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ways to begin">
          {STARTERS.map(([label, text]) => (
            <button key={label} type="button" onClick={() => begin(text)}
              className="min-h-[44px] px-3.5 rounded-full bg-[#f6efe4] text-[14px] text-[#514636] active:bg-[#efe3cf]">{label}</button>
          ))}
        </div>
      )}
      <textarea
        ref={box}
        value={words} onChange={(e) => setWords(e.target.value)} autoFocus={autoFocus}
        onPaste={(e) => { const f = Array.from(e.clipboardData?.files || []); if (f.length) { e.preventDefault(); add(f); } }}
        placeholder={placeholder} rows={3}
        className="w-full rounded-xl border border-[#e0d8cc] bg-white px-3 py-2.5 text-[16px] text-[#3a3128] placeholder:text-[#9a8d78] focus:outline-none focus:border-[#a89880]"
      />
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-1.5 pr-1.5">
          {previews.map((u, i) => (
            <span key={u} className="relative">
              <img src={u} alt="" className={invite ? "w-[72px] h-[128px] rounded-lg object-cover object-top border border-[#e0d8cc]" : "w-16 h-16 rounded-lg object-cover border border-[#e0d8cc]"} />
              {/* (a 44-pt target around the small ✕ — verify62: it was 28) */}
              <button type="button" onClick={() => { setTooMany(false); setFiles((old) => old.filter((_, j) => j !== i)); }} aria-label="Take this picture off"
                className="absolute -top-3.5 -right-3.5 w-11 h-11 flex items-center justify-center">
                <span className="w-7 h-7 rounded-full bg-[#3a3128] text-white text-xs flex items-center justify-center">✕</span>
              </button>
            </span>
          ))}
        </div>
      )}
      {tooMany && <p className="text-sm text-[#6b5d4a]">Six screenshots is the most for one idea. The first six are here.</p>}
      <div className="flex items-center gap-3">
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        {(!invite || files.length > 0) && (
          <button type="button" onClick={() => input.current?.click()} disabled={files.length >= 6}
            className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2 disabled:opacity-40">
            {files.length ? "Add another screenshot" : "Add a screenshot"}
          </button>
        )}
        {sent && <span className="text-sm text-[#4a6a3a]" role="status">✓ Posted</span>}
        <button type="button" onClick={send} disabled={busy || (!words.trim() && !files.length)}
          className="ml-auto min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm font-medium disabled:opacity-40">
          {busy ? "Posting…" : button}
        </button>
      </div>
      {error && <p className="text-sm text-[#8a3a1a]" role="alert">{error}</p>}
      {invite && <p className="text-[12px] text-[#8a7d68]">To take a screenshot on iPhone, press the side button and volume up together.</p>}
    </div>
  );
}

// (Scout's emphasis came through as "*when*" — andy-ideas; plain words on the page)
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[\s(])[*_](\S.*?\S|\S)[*_](?=[\s).,;:!?]|$)/g, "$1$2");

function Post({ p, since }: { p: IdeaPost; since: string | null }) {
  const label = p.role === "helper" ? "Scout" : p.role === "engineer" ? ENGINEER_LABEL : p.mine ? "You" : p.who;
  // (new since they last looked: anyone else's, Scout's and Claude's included — verify62)
  const fresh = !p.mine && !!since && p.at > since;
  // A status that moved, as one quiet line: "Ken marked it Built · Thu 3:10 PM"
  if (p.role === "status") {
    const s = (p.words in STATUS_WORDS ? p.words : "new") as IdeaStatus;
    return (
      <p className="text-xs text-[#6b5d4a]">
        <span className="font-medium text-[#3a3128]">{p.mine ? "You" : p.who === ENGINEER_LABEL ? "Claude" : p.who}</span> marked it{" "}
        <span className={`px-1.5 py-0.5 rounded-full border font-medium ${STATUS_LOOK[s]}`}>{STATUS_WORDS[s]}</span> · {when(p.at)}
        {fresh && <span className="ml-1.5 px-1.5 rounded bg-[#fdebd9] text-[#a85a1c] font-medium">new</span>}
      </p>
    );
  }
  // (Scout's and Claude's answers as a reply bubble, so a person's words and the answers never blur together)
  const answer = p.role !== "person";
  return (
    <div className={`flex flex-col gap-1.5 ${answer ? "bg-[#f8f1e6] rounded-2xl rounded-tl-md px-3.5 py-2.5" : ""}`}>
      <p className="text-xs text-[#6b5d4a]">
        <span className={`font-medium ${answer ? "text-[#8a5a1a]" : "text-[#3a3128]"}`}>{label}</span> · {when(p.at)}{p.screen ? ` · on ${p.screen}` : ""}
        {fresh && <span className="ml-1.5 px-1.5 rounded bg-[#fdebd9] text-[#a85a1c] font-medium">new</span>}
      </p>
      {p.words && <p className="text-[15px] text-[#3a3128] whitespace-pre-line [overflow-wrap:anywhere]">{answer ? plain(p.words) : p.words}</p>}
      {p.pictures.length > 0 && <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">{p.pictures.map((id) => <Thumb key={id} id={id} who={label} />)}</div>}
    </div>
  );
}

const STATUS_LOOK: Record<IdeaStatus, string> = {
  new: "bg-[#fdebd9] text-[#a85a1c] border-[#f3cfa8]",
  talking: "bg-[#eef1f8] text-[#3d4f7a] border-[#cfd8ea]",
  planned: "bg-[#fbf2dd] text-[#8a5a1a] border-[#ecd7a6]",
  built: "bg-[#e9f2e3] text-[#3f6430] border-[#c5dcb7]",
  "not-now": "bg-[#f3f0eb] text-[#8a7d68] border-[#e0d8cc]",
};

function IdeaCard({ idea, tripId, waiting, since, onChanged }: { idea: Idea; tripId: string; waiting: boolean; since: string | null; onChanged: () => void }) {
  const [replying, setReplying] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  useEffect(() => setStatus(idea.status), [idea.status]);
  const choose = async (s: IdeaStatus) => {
    setChoosing(false);
    const was = status; setStatus(s);
    try { await setIdeaStatus(tripId, idea.id, s); onChanged(); } catch { setStatus(was); }
  };
  return (
    <li id={`idea-${idea.id}`} className="bg-white rounded-2xl border border-[#e0d8cc] overflow-hidden flex flex-col scroll-mt-4">
      {/* (an idea that's now in Wander says so, across its top) */}
      {status === "built" && <p className="bg-[#e9f2e3] text-[#3f6430] text-[13px] font-medium px-4 py-2">✓ In Wander now{idea.mine ? ", from your idea" : ""}</p>}
      {/* (just posted: said on the idea itself, where his eyes are — tourist66: "✓ Posted" went with the box) */}
      {waiting && status !== "built" && <p className="bg-[#e9f2e3] text-[#3f6430] text-[13px] font-medium px-4 py-2">✓ Posted</p>}
      <div className="p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1"><Post p={idea} since={since} /></div>
        <button type="button" onClick={() => setChoosing((c) => !c)} aria-expanded={choosing} aria-label={`Status: ${STATUS_WORDS[status]}. Change it`}
          className="shrink-0 min-h-[44px] -mt-2.5 -mr-1 flex items-center">
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium border ${STATUS_LOOK[status]}`}>{STATUS_WORDS[status]} ▾</span>
        </button>
      </div>
      {choosing && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose its status">
          {ORDER.map((s) => (
            <button key={s} type="button" onClick={() => choose(s)} aria-pressed={s === status}
              className={`min-h-[44px] px-3.5 rounded-full text-sm border ${s === status ? "bg-[#514636] text-white border-[#514636]" : "border-[#e0d8cc] text-[#514636]"}`}>{STATUS_WORDS[s]}</button>
          ))}
        </div>
      )}
      {(idea.replies.length > 0 || waiting) && (
        <ul className="flex flex-col gap-3 pl-3">
          {idea.replies.map((r) => <li key={r.id}><Post p={r} since={since} /></li>)}
          {waiting && <li className="text-sm text-[#8a5a1a] bg-[#f8f1e6] rounded-2xl rounded-tl-md px-3.5 py-2.5 motion-safe:animate-pulse">Scout is reading it…</li>}
        </ul>
      )}
      {replying
        ? <Composer draftId={`reply-${idea.id}`} placeholder="Your reply" button="Reply" autoFocus
            onPost={async (words, files) => { const r = await postIdea(tripId, words, files, { parentId: idea.id }); if ("error" in r) return r.error; setReplying(false); onChanged(); return null; }} />
        : <button type="button" onClick={() => setReplying(true)} className="self-start min-h-[44px] min-w-[44px] -ml-2 px-2 text-sm text-[#514636] underline underline-offset-2">Reply</button>}
      </div>
    </li>
  );
}

export default function IdeasForWanderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tripId, setTripId] = useState<string | null>(() => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } });
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  // when they last looked before this visit — what's newer is marked "new" (kept for the whole visit)
  const [since, setSince] = useState<string | null | undefined>(undefined);
  const firstLoad = useRef(true);
  const [notMember, setNotMember] = useState(false);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<IdeaStatus | "all">("all");
  // the idea just posted, until Scout's answer comes (or about 45 s go by)
  const [awaiting, setAwaiting] = useState<{ id: string; until: number } | null>(null);
  // The box for a new idea: open when there are none yet, or a draft is waiting; otherwise one bar, so the ideas are the
  // first screen (andy-ideas: a full screen of form, and his post landed out of sight)
  const [composing, setComposing] = useState<boolean | null>(() => (readDraft("new") ? true : null));
  const [justPosted, setJustPosted] = useState<string | null>(null);

  useEffect(() => {
    if (tripId) return;
    api.get<{ id?: string }>("/trips/active").then((t) => setTripId(t?.id || null)).catch(() => setOffline(true));
  }, [tripId]);
  const load = useCallback((): Promise<void> => {
    if (!tripId) return Promise.resolve();
    return ideasOf(tripId).then((r) => {
      setIdeas(r.ideas); setOffline(false);
      // (the first answer of this visit sets what's "new"; only then is the visit counted as seen)
      if (firstLoad.current) { firstLoad.current = false; setSince(r.seenAt); ideasSeen(tripId); }
    }).catch((e: { status?: number }) => { if (e?.status === 403) setNotMember(true); else setOffline(true); });
  }, [tripId]);
  useEffect(() => { load(); }, [load]);
  // (Scout's answer arrives in a few seconds: look again until it's there)
  useEffect(() => {
    if (!awaiting) return;
    const t = setInterval(() => {
      if (Date.now() > awaiting.until) { setAwaiting(null); return; }
      load();
    }, 3000);
    return () => clearInterval(t);
  }, [awaiting, load]);
  useEffect(() => {
    if (awaiting && ideas?.find((i) => i.id === awaiting.id)?.replies.some((r) => r.role === "helper")) { setAwaiting(null); if (tripId) ideasSeen(tripId); }
  }, [ideas, awaiting, tripId]);

  // (opened straight into Ideas, there's no page of Wander's behind it — Home, never out of Wander: andy-ideas)
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/"));
  // The idea just posted, brought into view as it lands — his screenshot, then "Scout is reading it…", then the answer
  useEffect(() => {
    if (!justPosted || !ideas?.some((i) => i.id === justPosted)) return;
    requestAnimationFrame(() => document.getElementById(`idea-${justPosted}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    setJustPosted(null);
  }, [ideas, justPosted]);
  const open = composing ?? (ideas !== null && ideas.length === 0);
  const counts = Object.fromEntries(ORDER.map((s) => [s, (ideas || []).filter((i) => i.status === s).length])) as Record<IdeaStatus, number>;
  const shown = (ideas || []).filter((i) => filter === "all" || i.status === filter);

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      {/* (scrolls away with the page: fixed, its three lines took a fifth of the screen — verify62) */}
      <header className="px-4 pb-5 bg-gradient-to-b from-[#f6e7cf] to-[#faf8f5]" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <div className="max-w-2xl mx-auto">
          <button type="button" onClick={back} className="min-h-[44px] text-sm text-[#514636]">‹ Back to the trip</button>
          <div className="flex items-center gap-3 mt-1">
            <span className="shrink-0 w-12 h-12 rounded-2xl bg-[#c8a060] text-white flex items-center justify-center shadow-sm" aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={SPARKLE} /></svg>
            </span>
            <div>
              <h1 className="text-2xl text-[#3a3128] leading-tight">Ideas for Wander</h1>
              <p className="text-sm text-[#6b5d4a]">Just Ken and Andy</p>
            </div>
          </div>
          <p className="text-[15px] text-[#514636] mt-3 leading-snug">Show a screen and say what you’d change. Scout answers in a few seconds. Claude reads every idea and builds Wander with Ken.</p>
        </div>
      </header>

      <main className="px-4 pt-4 flex flex-col gap-5 max-w-2xl mx-auto">
        {notMember && <p className="text-sm text-[#6b5d4a]">Ideas for Wander is Ken and Andy’s. To pass something about Wander to Ken, open Scout and say “Tell Ken…”.</p>}
        {offline && !ideas && <p className="text-sm text-[#6b5d4a]">No signal just now, so the ideas can’t load. They’ll show when there’s signal.</p>}
        {tripId && !notMember && !open && ideas && (
          <button type="button" onClick={() => setComposing(true)}
            className="w-full min-h-[72px] rounded-2xl border-2 border-dashed border-[#d9c7a6] bg-white flex items-center gap-3.5 px-4 text-left active:bg-[#fdf8f0]">
            <span className="shrink-0 w-10 h-10 rounded-full bg-[#c8a060] text-white flex items-center justify-center text-2xl leading-none" aria-hidden>+</span>
            <span>
              <span className="block text-[16px] font-medium text-[#3a3128]">A new idea</span>
              <span className="block text-[13px] text-[#6b5d4a]">A screenshot and a few words</span>
            </span>
          </button>
        )}
        {tripId && !notMember && open && (
          <section className="bg-white rounded-2xl border border-[#e0d8cc] p-4 flex flex-col gap-2" aria-label="A new idea">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-medium text-[#3a3128]">A new idea</h2>
              {!!ideas?.length && <button type="button" onClick={() => setComposing(false)} className="min-h-[44px] px-2 -mr-2 text-sm text-[#514636]">Not now</button>}
            </div>
            <Composer draftId="new" button="Post" invite placeholder="What would make Wander better?"
              onPost={async (words, files) => {
                const r = await postIdea(tripId, words, files);
                if ("error" in r) return r.error;
                // (the box folds only once his idea is on the page, so it never vanishes between the two — tourist66: for
                // up to 3.5 s it was nowhere)
                setFilter("all"); setAwaiting({ id: r.id, until: Date.now() + 45_000 });
                await load();
                setComposing(false); setJustPosted(r.id);
                return null;
              }} />
          </section>
        )}
        {/* From idea to Wander: where every idea stands, in order — a tap shows those (again, all) */}
        {ideas && ideas.length > 0 && (
          <div role="group" aria-label="Show ideas by where they stand">
            <div className="grid grid-cols-4 gap-1.5">
              {(["new", "talking", "planned", "built"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setFilter((f) => (f === s ? "all" : s))} aria-pressed={filter === s}
                  className={`min-h-[60px] rounded-xl border flex flex-col items-center justify-center ${filter === s ? "bg-[#514636] text-white border-[#514636]" : `${STATUS_LOOK[s]}`}`}>
                  <span className="text-[20px] font-medium leading-none">{counts[s]}</span>
                  <span className="text-[12px] mt-1">{STATUS_WORDS[s]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {filter !== "all" && <button type="button" onClick={() => setFilter("all")} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Show all {ideas.length}</button>}
              {counts["not-now"] > 0 && (
                <button type="button" onClick={() => setFilter((f) => (f === "not-now" ? "all" : "not-now"))} aria-pressed={filter === "not-now"}
                  className="min-h-[44px] text-sm text-[#8a7d68] underline underline-offset-2 ml-auto">{filter === "not-now" ? "Back to all" : `Not now ${counts["not-now"]}`}</button>
              )}
            </div>
          </div>
        )}
        {/* (nothing posted yet: what an idea and its answer look like, plainly an example — andy-ideas: the empty page
            only repeated the header) */}
        {ideas && ideas.length === 0 && (
          <section aria-label="An example" className="rounded-2xl border border-[#e0d8cc] bg-white/60 p-4 flex flex-col gap-3">
            <p className="text-[11px] uppercase tracking-[.12em] text-[#8a7d68]">An example</p>
            <div className="flex gap-3 items-start">
              <span className="shrink-0 w-[60px] h-[106px] rounded-lg border border-[#e0d8cc] bg-gradient-to-b from-[#efe3cf] to-[#f6efe4] flex flex-col gap-1.5 p-1.5" aria-hidden>
                <span className="h-5 rounded bg-[#c8a060]/50" /><span className="h-1.5 w-3/4 rounded bg-[#514636]/25" /><span className="h-1.5 w-1/2 rounded bg-[#514636]/25" /><span className="h-7 rounded bg-white" />
              </span>
              <p className="text-[15px] text-[#3a3128]">More of this: the photo behind each day. Could the Next tab have one too?</p>
            </div>
            <p className="text-[14px] text-[#3a3128] bg-[#f8f1e6] rounded-2xl rounded-tl-md px-3.5 py-2.5"><span className="block text-xs font-medium text-[#8a5a1a] mb-0.5">Scout</span>I get the goal: you want to recognise where you’re headed at a glance. What about a small photo of the next stop beside its name?</p>
          </section>
        )}
        {shown.length === 0 && ideas && ideas.length > 0 && <p className="text-sm text-[#6b5d4a]">None marked {filter === "all" ? "" : STATUS_WORDS[filter as IdeaStatus]} right now.</p>}
        <ul className="flex flex-col gap-4">
          {shown.map((i) => <IdeaCard key={i.id} idea={i} tripId={tripId!} waiting={awaiting?.id === i.id} since={since ?? null} onChanged={load} />)}
        </ul>
      </main>
    </div>
  );
}
