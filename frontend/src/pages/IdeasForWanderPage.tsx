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
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ideasOf, ideasSeen, postIdea, setIdeaStatus, ideaPictureUrl, STATUS_WORDS, type Idea, type IdeaPost, type IdeaStatus } from "../lib/wanderIdeas";
import PictureViewer from "../components/PictureViewer";

const ORDER: IdeaStatus[] = ["new", "talking", "planned", "built", "not-now"];
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const draftKey = (k: string) => `wander:idea-draft:${k}`;
const readDraft = (k: string) => { try { return localStorage.getItem(draftKey(k)) || ""; } catch { return ""; } };
const writeDraft = (k: string, v: string) => { try { if (v) localStorage.setItem(draftKey(k), v); else localStorage.removeItem(draftKey(k)); } catch { /* private window */ } };

function Thumb({ id, who }: { id: string; who: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => { let live = true; ideaPictureUrl(id).then((u) => { if (live) setUrl(u); }); return () => { live = false; }; }, [id]);
  if (!url) return <span className="block w-24 h-24 rounded-lg bg-[#f0ebe3]" aria-label="Loading a picture" />;
  return (
    <>
      <button type="button" onClick={() => setFull(true)} className="block w-24 h-24 rounded-lg overflow-hidden border border-[#e0d8cc]" aria-label={`See ${who}'s picture full screen`}>
        <img src={url} alt="" className="w-full h-full object-cover" />
      </button>
      {full && <PictureViewer src={url} alt={`A picture ${who} posted`} onClose={() => setFull(false)} />}
    </>
  );
}

/** The box for an idea or a reply: words, screenshots (chosen or pasted), Post */
function Composer({ draftId, placeholder, button, onPost, autoFocus }: {
  draftId: string; placeholder: string; button: string; autoFocus?: boolean;
  onPost: (words: string, files: File[]) => Promise<string | null>;
}) {
  const [words, setWords] = useState(() => readDraft(draftId));
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { writeDraft(draftId, words); }, [draftId, words]);
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setPreviews(u); return () => u.forEach((x) => URL.revokeObjectURL(x)); }, [files]);
  const add = (list: FileList | File[] | null) => {
    const pics = Array.from(list || []).filter((f) => f.type.startsWith("image/") || !f.type);
    if (pics.length) setFiles((old) => [...old, ...pics].slice(0, 6));
  };
  const send = async () => {
    if (busy || (!words.trim() && !files.length)) return;
    setBusy(true); setError(null);
    const err = await onPost(words.trim(), files);
    setBusy(false);
    if (err) { setError(err); return; }
    setWords(""); setFiles([]); writeDraft(draftId, "");
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={words} onChange={(e) => setWords(e.target.value)} autoFocus={autoFocus}
        onPaste={(e) => { const f = Array.from(e.clipboardData?.files || []); if (f.length) { e.preventDefault(); add(f); } }}
        placeholder={placeholder} rows={3}
        className="w-full rounded-xl border border-[#e0d8cc] bg-white px-3 py-2.5 text-[16px] text-[#3a3128] placeholder:text-[#9a8d78] focus:outline-none focus:border-[#a89880]"
      />
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((u, i) => (
            <span key={u} className="relative">
              <img src={u} alt="" className="w-16 h-16 rounded-lg object-cover border border-[#e0d8cc]" />
              <button type="button" onClick={() => setFiles((old) => old.filter((_, j) => j !== i))} aria-label="Take this picture off"
                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#3a3128] text-white text-xs">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => input.current?.click()} disabled={files.length >= 6}
          className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2 disabled:opacity-40">
          {files.length ? "Add another screenshot" : "Add a screenshot"}
        </button>
        <button type="button" onClick={send} disabled={busy || (!words.trim() && !files.length)}
          className="ml-auto min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm font-medium disabled:opacity-40">
          {busy ? "Posting…" : button}
        </button>
      </div>
      {error && <p className="text-sm text-[#8a3a1a]" role="alert">{error}</p>}
    </div>
  );
}

function Post({ p }: { p: IdeaPost }) {
  const label = p.role === "helper" ? "Scout" : p.role === "engineer" ? "Claude, Wander's engineer" : p.mine ? "You" : p.who;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-[#6b5d4a]">
        <span className={`font-medium ${p.role === "person" ? "text-[#3a3128]" : "text-[#8a5a1a]"}`}>{label}</span> · {when(p.at)}{p.screen ? ` · on ${p.screen}` : ""}
      </p>
      {p.words && <p className="text-[15px] text-[#3a3128] whitespace-pre-line [overflow-wrap:anywhere]">{p.words}</p>}
      {p.pictures.length > 0 && <div className="flex flex-wrap gap-2">{p.pictures.map((id) => <Thumb key={id} id={id} who={label} />)}</div>}
    </div>
  );
}

function IdeaCard({ idea, tripId, waiting, onChanged }: { idea: Idea; tripId: string; waiting: boolean; onChanged: () => void }) {
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
    <li className="bg-white rounded-2xl border border-[#e0d8cc] p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1"><Post p={idea} /></div>
        <button type="button" onClick={() => setChoosing((c) => !c)} aria-expanded={choosing} aria-label={`Status: ${STATUS_WORDS[status]}. Change it`}
          className={`shrink-0 min-h-[32px] px-2.5 rounded-full text-xs border ${status === "built" ? "border-[#7a9a6a] text-[#4a6a3a]" : status === "planned" ? "border-[#c8a25a] text-[#8a5a1a]" : status === "not-now" ? "border-[#cfc5b5] text-[#9a8d78]" : "border-[#e0d8cc] text-[#514636]"}`}>
          {STATUS_WORDS[status]} ▾
        </button>
      </div>
      {choosing && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose its status">
          {ORDER.map((s) => (
            <button key={s} type="button" onClick={() => choose(s)} aria-pressed={s === status}
              className={`min-h-[36px] px-3 rounded-full text-sm border ${s === status ? "bg-[#514636] text-white border-[#514636]" : "border-[#e0d8cc] text-[#514636]"}`}>{STATUS_WORDS[s]}</button>
          ))}
        </div>
      )}
      {(idea.replies.length > 0 || waiting) && (
        <ul className="flex flex-col gap-3 border-l-2 border-[#f0ebe3] pl-3">
          {idea.replies.map((r) => <li key={r.id}><Post p={r} /></li>)}
          {waiting && <li className="text-sm text-[#6b5d4a]">Scout is reading it…</li>}
        </ul>
      )}
      {replying
        ? <Composer draftId={`reply-${idea.id}`} placeholder="Your reply" button="Reply" autoFocus
            onPost={async (words, files) => { const r = await postIdea(tripId, words, files, { parentId: idea.id }); if ("error" in r) return r.error; setReplying(false); onChanged(); return null; }} />
        : <button type="button" onClick={() => setReplying(true)} className="self-start min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Reply</button>}
    </li>
  );
}

export default function IdeasForWanderPage() {
  const navigate = useNavigate();
  const [tripId, setTripId] = useState<string | null>(() => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } });
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [notMember, setNotMember] = useState(false);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<IdeaStatus | "all">("all");
  // the idea just posted, until Scout's answer comes (or about 45 s go by)
  const [awaiting, setAwaiting] = useState<{ id: string; until: number } | null>(null);

  useEffect(() => {
    if (tripId) return;
    api.get<{ id?: string }>("/trips/active").then((t) => setTripId(t?.id || null)).catch(() => setOffline(true));
  }, [tripId]);
  const load = useCallback(() => {
    if (!tripId) return;
    ideasOf(tripId).then((l) => { setIdeas(l); setOffline(false); })
      .catch((e: { status?: number }) => { if (e?.status === 403) setNotMember(true); else setOffline(true); });
  }, [tripId]);
  useEffect(() => { load(); if (tripId) ideasSeen(tripId); }, [tripId, load]);
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

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
  const counts = Object.fromEntries(ORDER.map((s) => [s, (ideas || []).filter((i) => i.status === s).length])) as Record<IdeaStatus, number>;
  const shown = (ideas || []).filter((i) => filter === "all" || i.status === filter);

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      <header className="sticky z-20 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] px-4 pb-3" style={{ top: 0, paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <button type="button" onClick={back} className="min-h-[44px] text-sm text-[#514636]">‹ Back to the trip</button>
        <h1 className="text-2xl text-[#3a3128]">Ideas for Wander</h1>
        <p className="text-sm text-[#6b5d4a] mt-0.5">Just Ken and Andy. Scout answers each idea, and Claude, Wander’s engineer, picks them up and keeps each one’s status.</p>
      </header>

      <main className="px-4 pt-4 flex flex-col gap-5 max-w-2xl mx-auto">
        {notMember && <p className="text-sm text-[#6b5d4a]">Ideas for Wander is Ken and Andy’s. To pass something about Wander to Ken, open Scout and say “Tell Ken…”.</p>}
        {offline && !ideas && <p className="text-sm text-[#6b5d4a]">No signal just now, so the ideas can’t load. They’ll show when there’s signal.</p>}
        {tripId && !notMember && (
          <section className="bg-white rounded-2xl border border-[#e0d8cc] p-4 flex flex-col gap-2" aria-label="A new idea">
            <h2 className="text-sm font-medium text-[#3a3128]">A new idea</h2>
            <Composer draftId="new" button="Post" placeholder="What would make Wander better? A screenshot helps."
              onPost={async (words, files) => {
                const r = await postIdea(tripId, words, files);
                if ("error" in r) return r.error;
                setFilter("all"); setAwaiting({ id: r.id, until: Date.now() + 45_000 }); load();
                return null;
              }} />
          </section>
        )}
        {ideas && ideas.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show ideas by status">
            {(["all", ...ORDER] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFilter(s)} aria-pressed={filter === s}
                className={`min-h-[36px] px-3 rounded-full text-sm border ${filter === s ? "bg-[#514636] text-white border-[#514636]" : "border-[#e0d8cc] text-[#514636] bg-white"}`}>
                {s === "all" ? `All ${ideas.length}` : `${STATUS_WORDS[s]} ${counts[s]}`}
              </button>
            ))}
          </div>
        )}
        {ideas && ideas.length === 0 && <p className="text-sm text-[#6b5d4a]">No ideas yet. Post the first one: a screenshot of anything in Wander, and what would make it better.</p>}
        {shown.length === 0 && ideas && ideas.length > 0 && <p className="text-sm text-[#6b5d4a]">None marked {filter === "all" ? "" : STATUS_WORDS[filter as IdeaStatus]} right now.</p>}
        <ul className="flex flex-col gap-4">
          {shown.map((i) => <IdeaCard key={i.id} idea={i} tripId={tripId!} waiting={awaiting?.id === i.id} onChanged={load} />)}
        </ul>
      </main>
    </div>
  );
}
