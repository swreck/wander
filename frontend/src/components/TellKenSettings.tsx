/**
 * "Tell Ken" in Settings (Oct 14 2026, Ken: "if they would like a feature added to wander or anything about the way
 * wander works is confusing, they can speak or type at that moment what they want and it will become a message to Ken
 * to try to fix"). For Ken (the trip's organizer): what Larisa, Andy and Julie sent, newest first, each with who, when,
 * where they were and their words exactly. For everyone else: one row that opens Scout ready to write "Tell Ken…".
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Message = { id: string; who: string; words: string; screen: string | null; hasPicture: boolean; read: boolean; at: string };

export default function TellKenSettings() {
  // (the trip this phone was last on; on a phone that opened Settings first, the active trip — Ken saw the row meant for
  // the others when Settings was his first screen)
  const [tripId, setTripId] = useState<string | null>(() => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } });
  useEffect(() => {
    if (tripId) return;
    api.get<{ id?: string }>("/trips/active").then((t) => setTripId(t?.id || "none")).catch(() => setTripId("none"));
  }, [tripId]);
  // null: still asking; "others": not the organizer; a list: Ken's
  const [list, setList] = useState<Message[] | "others" | null>(null);
  // (a picture is loaded with his sign-in and shown in place — a plain link to it carries no sign-in)
  const [pictures, setPictures] = useState<Record<string, string>>({});
  const showPicture = (id: string) => {
    let token = ""; try { token = localStorage.getItem("wander_token") || ""; } catch { /* none */ }
    fetch(`/api/tell-ken/${id}/picture`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => setPictures((p) => ({ ...p, [id]: URL.createObjectURL(b) })))
      .catch(() => {});
  };
  useEffect(() => {
    if (!tripId) return;
    if (tripId === "none") { setList("others"); return; }
    let live = true;
    // (whether this person is the organizer, asked plainly; then, for Ken, his list. Only a definite "not the organizer"
    // shows the others' row; no signal or a slow server shows nothing — verify60: Ken saw "Tell Ken about Wander" when his
    // list couldn't load)
    api.get<{ organizer?: boolean }>(`/tell-ken/trip/${tripId}/organizer`)
      .then((r) => {
        if (!live) return;
        if (r?.organizer === false) { setList("others"); return; }
        if (r?.organizer === true) api.get<Message[]>(`/tell-ken/trip/${tripId}`).then((l) => { if (live && Array.isArray(l)) setList(l); }).catch(() => { /* shows nothing */ });
      })
      .catch(() => { /* no signal: shows nothing */ });
    return () => { live = false; };
  }, [tripId]);
  // (opened from the buzz on his phone: straight to the list)
  useEffect(() => {
    if (Array.isArray(list) && /tellken=1/.test(window.location.search)) document.getElementById("tell-ken")?.scrollIntoView({ block: "start" });
  }, [list]);

  if (list === null) return null;
  if (list === "others") {
    return (
      <section>
        <button onClick={() => window.dispatchEvent(new CustomEvent("wander-open-chat", { detail: { prefill: "Tell Ken " } }))}
          className="w-full min-h-[52px] flex items-center justify-between px-4 rounded-xl bg-white border border-[#e0d8cc] text-left">
          <span>
            <span className="block text-sm font-medium text-[#3a3128]">Tell Ken about Wander</span>
            <span className="block text-xs text-[#6b5d4a] mt-0.5">Something confusing, or a wish for it. He gets your words exactly.</span>
          </span>
          <span className="text-[#6b5d4a]" aria-hidden>›</span>
        </button>
      </section>
    );
  }
  const day = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const unread = list.filter((m) => !m.read).length;
  return (
    <section id="tell-ken" className="rounded-xl bg-white border border-[#e0d8cc] p-4">
      <h2 className="text-sm font-medium text-[#3a3128]">About Wander, from the others{unread ? ` · ${unread} new` : ""}</h2>
      <p className="text-xs text-[#6b5d4a] mt-0.5">What they told Scout to tell you, word for word. No one else on the trip sees these.</p>
      {!list.length && <p className="text-sm text-[#6b5d4a] mt-3">Nothing yet.</p>}
      <ul className="mt-2 divide-y divide-[#f0ebe3]">
        {list.map((m) => (
          <li key={m.id} className="py-3">
            <div className="text-xs text-[#6b5d4a]">
              <span className={`font-medium ${m.read ? "text-[#514636]" : "text-[#3a3128]"}`}>{m.who}</span> · {day(m.at)}{m.screen ? ` · on ${m.screen}` : ""}
              {!m.read && <span className="ml-1 text-[#8a5a1a]">· new</span>}
            </div>
            <p className="text-sm text-[#3a3128] mt-1 whitespace-pre-line">“{m.words}”</p>
            {pictures[m.id] && <img src={pictures[m.id]} alt={`What ${m.who} sent with it`} className="mt-2 max-h-80 rounded-lg border border-[#e0d8cc]" />}
            <div className="flex items-center gap-4">
              {m.hasPicture && !pictures[m.id] && (
                <button onClick={() => showPicture(m.id)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">See the picture</button>
              )}
              {!m.read && (
                <button onClick={() => { setList((l) => (Array.isArray(l) ? l.map((x) => (x.id === m.id ? { ...x, read: true } : x)) : l)); api.post(`/tell-ken/${m.id}/read`, {}).catch(() => {}); }}
                  className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Mark as read</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
