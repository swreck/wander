/**
 * The trip on a map, at the top of Home (charm item C1, Oct 1 2026; redrawn the same day after a fresh design review).
 *
 * What the review found on an iPhone, and what this does about it:
 * - Markers hid each other (Karatsu and Hakata are 40 km apart: 11 pt on a phone) → markers closer than a fingertip
 *   become one ("2 · 3"), and tapping it offers both cities.
 * - Every city was named twice — our tag on top of Google's own label ("Tokyo okyo") → Google's place labels are off
 *   (a calm, warm map: land, water, country names) and our tags go on whichever side is free.
 * - The trip filled 60% of the map → the view is fitted to the trip's cities (fractional zoom), with the title below the
 *   map instead of over it (it also hid Google's logo and data credit, which must show).
 * - The order couldn't be read → a stronger route line with an arrow on every leg, and the start ringed.
 * - The map didn't change during the trip → today's city is dark, the ones already visited fade.
 *
 * Markers are drawn by Wander (an OverlayView) rather than Google's AdvancedMarker: Google ignores a map's own styling
 * when its markers are used, and the styling is what takes Google's labels off.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import type { City, Day } from "../lib/types";
import { getCityPastel } from "../lib/cityColors";
import { guideData, savedGuideData } from "../lib/guideData";
import { tripToday } from "../lib/tripNotes";
import { homeOnJapanDate } from "../lib/guideDisplay";
import { useAuth } from "../contexts/AuthContext";
import useBackToClose from "../hooks/useBackToClose";
import { MARKER, TOUCH, SEGMENT, GOOGLE_STRIP, pixel, place, tagFor, isHere, layoutMap, type Stop, type Group, type View, type Layout, type LayoutInput, type NameWidths } from "../lib/homeMapLayout";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// A calm map in Wander's colors: parchment land, soft water — and no words but ours (Google's country and sea names
// sat under the markers and were cut off at the edges; its city names doubled ours)
const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#cdbfa9" }] },
  { featureType: "administrative.province", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", stylers: [{ visibility: "off" }] },
  { featureType: "road", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  // (a touch deeper than the palest city color, so a "warm" marker never melts into the land — round 7)
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#e8e1d2" }] },
  { featureType: "landscape.natural.terrain", elementType: "geometry", stylers: [{ color: "#e3dbca" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfdde2" }] },
];

const INK = "#514636";

/** The layout itself is worked out in a worker (lib/homeMapLayout.worker.ts), off the page — on the page it froze Home up
 *  to 1 s at a time (Oct 10 re-audit). One worker for the app; each answer matched to its question. With no worker (an
 *  old browser, or it fails to start) it's worked out here, as before. */
let worker: Worker | null | undefined;
let asked = 0;
const waiting = new Map<number, { ok: (l: Layout) => void; no: (e: unknown) => void }>();
function layoutOffPage(input: LayoutInput): Promise<Layout> {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL("../lib/homeMapLayout.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<{ id: number; layout?: Layout; error?: string }>) => {
        const w = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        if (w) (e.data.layout ? w.ok(e.data.layout) : w.no(e.data.error));
      };
      worker.onerror = () => { for (const w of waiting.values()) w.no("worker failed"); waiting.clear(); worker = null; };
    } catch { worker = null; }
  }
  if (!worker) return Promise.resolve(layoutMap(input));
  const id = ++asked;
  return new Promise<Layout>((ok, no) => { waiting.set(id, { ok, no }); worker!.postMessage({ id, input }); })
    .catch(() => layoutMap(input));
}

/** The map's settled view per trip — its height, zoom and middle — kept while Wander is open: coming back to Home it's
 *  shown just so, not fitted again (each refit nudged the zoom, and the zoom the height: 216 ↔ 234 pt, every visit) */
type Settled = { height: number; zoom: number; center: google.maps.LatLngLiteral };
const settledViews = new Map<string, Settled>();

/** The stops, and the markers', lines' and names' layouts already worked out — kept while Wander is open and used again
 *  for the same trip, contents and view (Oct 10 audit: coming back to Home froze the page 4–9 s while the layout was
 *  worked out ~9 times over — Home hands the map a new but identical city list on each of its redraws). */
const kept = new Map<string, unknown>();
function keptOr<T>(key: string, make: () => T): T {
  if (kept.has(key)) return kept.get(key) as T;
  const v = make();
  if (kept.size > 80) kept.clear();
  kept.set(key, v);
  return v;
}

/** The settled view and the finished layout kept on the phone too, so opening Wander again draws the map at once, at its
 *  settled view, with nothing worked out (Oct 10 re-audit: each app open spent ~1.9 s of the phone's time on the same
 *  layout — several times over, once for each view the map passed through while fitting — and Home froze up to 1 s at a
 *  time while it did). A few of each, newest kept. */
const VIEWS_ON_PHONE = "wander:map-views";
const LAYOUTS_ON_PHONE = "wander:map-layouts";
function fromPhone<T>(store: string, key: string): T | undefined {
  try { return (JSON.parse(localStorage.getItem(store) || "{}") as Record<string, T>)[key]; } catch { return undefined; }
}
function toPhone<T>(store: string, key: string, value: T, keep: number) {
  try {
    const all = JSON.parse(localStorage.getItem(store) || "{}") as Record<string, T>;
    delete all[key];
    all[key] = value;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - keep))) delete all[k];
    localStorage.setItem(store, JSON.stringify(all));
  } catch { /* storage full or private: worked out again next time */ }
}
/** A short name for a long key (the trip's cities and days) */
function shortHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}
const settledView = (viewKey: string) => settledViews.get(viewKey) ?? fromPhone<Settled>(VIEWS_ON_PHONE, viewKey);
const keepSettledView = (viewKey: string, s: Settled) => { settledViews.set(viewKey, s); toPhone(VIEWS_ON_PHONE, viewKey, s, 4); };

const shortDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** `cities`: the cities the map shows (in Japan, located); `allCities`: the trip's whole list, for the calendar colors */
export default function HomeTripMap({ tripId, cities, allCities, days, onOpenDay }: {
  tripId: string; cities: City[]; allCities: City[]; days: Day[]; onOpenDay: (date: string) => void;
}) {
  const [zone, setZone] = useState("Asia/Tokyo");
  useEffect(() => { guideData(tripId).then((g) => g?.trip.timeZone && setZone(g.trip.timeZone)).catch(() => { /* Japan time */ }); }, [tripId]);
  const today = tripToday(zone);
  // Still at home on this Japan date (Andy and Julie before their flight): no city is "today's stop" for you — the dark
  // chip on the others' city read as where you are (Sweep A, Oct 10: Nagoya, then Tokyo, while Julie was in California).
  // From this phone's copy of the trip, so it's right in the map's first drawing.
  const me = useAuth().user?.displayName ?? null;
  const noHere = useMemo(() => {
    const g = savedGuideData(tripId);
    return !!g && !!homeOnJapanDate(g.items || [], me, today, g.trip.timeZone || zone);
  }, [tripId, me, today, zone]);

  // The stops in the order they're visited (each change of city is a stop; a city visited twice has two numbers) — worked
  // out again only when what they're made of changes, not each time Home hands over a fresh copy of the same lists
  const stopsKey = `${tripId}|${JSON.stringify(cities.map((c) => [c.id, c.name, c.latitude, c.longitude]))}|${JSON.stringify(days.filter((d) => d.cityId).map((d) => [d.date.slice(0, 10), d.cityId]))}`;
  const { stops, order } = useMemo(() => keptOr(`stops|${stopsKey}`, () => {
    const sorted = [...days].filter((d) => d.cityId).sort((a, b) => a.date.localeCompare(b.date));
    const byCity = new Map<string, Stop>();
    const order: string[] = [];
    let last: string | null = null;
    let n = 0;
    for (const d of sorted) {
      const city = cities.find((c) => c.id === d.cityId);
      if (!city) continue;
      const date = d.date.slice(0, 10);
      if (city.id !== last) {
        n++;
        order.push(city.id);
        last = city.id;
        const s = byCity.get(city.id) || { city, visits: [], firstDay: date, lastDay: date };
        s.visits.push(n);
        byCity.set(city.id, s);
      }
      byCity.get(city.id)!.lastDay = date;
    }
    return { stops: Array.from(byCity.values()), order };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stopsKey]);

  // The map as tall as the trip needs at the phone's width (with room for names), up to 40% of the screen — a fixed
  // 40% left a third of it empty sea on a phone and pushed Today below the fold on a small one (map review round 3)
  const estimate = useMemo(() => {
    const w = typeof window !== "undefined" ? window.innerWidth : 390, h = typeof window !== "undefined" ? window.innerHeight : 844;
    const pts = stops.map((s) => pixel(s.city.latitude!, s.city.longitude!, 0));
    const dx = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const dy = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    const tall = dx > 0 ? dy * ((w - 64) / dx) + 120 : 280;
    return Math.round(Math.min(h * 0.4, Math.max(220, tall)));
  }, [stops]);
  // …then, once drawn, exactly as tall as the markers and names need (a stop drawn inside a shared marker left its own
  // place as empty sea — map review round 4) — remembered, so coming back to Home it's that height at once, no jump
  const viewKey = `${tripId}:${order.join(",")}`;
  const [fitted, setFitted] = useState<number | null>(() => settledView(`${tripId}:${order.join(",")}`)?.height ?? null);
  // (opened at the view it settled on last time — passing through Google's default view first meant laying the map out
  // for a view nobody saw)
  const startView = settledView(viewKey);
  const height = fitted ?? estimate;
  // "Whole trip": back to the fitted view after a pinch or a drag (there was no way back but leaving Home — tester t4)
  const [refit, setRefit] = useState(0);
  // (when Home opened — the map may still change height in the first moment, before anyone is reading)
  const openedAt = useRef(Date.now());

  if (!API_KEY || stops.length === 0) return null;
  return (
    <div className="relative bg-[#e8e1d2]" style={{ height }}>
      <APIProvider apiKey={API_KEY}>
        {/* (the map built the first time is kept and used again — Ken, Oct 9: "every time I go to home, there is a delay
            in showing the map… shouldn't those be cached on the phone" — it was built from nothing on every visit) */}
        <GoogleMap
          reuseMaps
          defaultCenter={startView?.center ?? { lat: stops[0].city.latitude!, lng: stops[0].city.longitude! }}
          defaultZoom={startView?.zoom ?? 6}
          styles={MAP_STYLE}
          isFractionalZoomEnabled
          gestureHandling="cooperative"
          disableDefaultUI
          clickableIcons={false}
          keyboardShortcuts={false}
          backgroundColor="#e8e1d2"
          style={{ width: "100%", height: "100%" }}
        >
          <Fit stops={stops} again={refit} viewKey={viewKey} />
          <Markers stops={stops} order={order} allCities={allCities} today={today} noHere={noHere} onOpenDay={onOpenDay} onHeight={setFitted}
            canResize={(want) => refit > 0 || want > (fitted ?? estimate) || Date.now() - openedAt.current < 300}
            again={refit} onWholeTrip={() => setRefit((n) => n + 1)} viewKey={viewKey} layoutKey={stopsKey} />
        </GoogleMap>
      </APIProvider>
    </div>
  );
}

/** The view: the trip's cities, filling the map */
function Fit({ stops, again, viewKey }: { stops: Stop[]; again: number; viewKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    // (back on Home: the view it settled on last time, as it was — "Whole trip" fits afresh)
    const kept = again === 0 ? settledView(viewKey) : undefined;
    if (kept) { map.setZoom(kept.zoom); map.setCenter(kept.center); return; }
    if (stops.length === 1) { map.setCenter({ lat: stops[0].city.latitude!, lng: stops[0].city.longitude! }); map.setZoom(10); return; }
    const b = new google.maps.LatLngBounds();
    for (const s of stops) b.extend({ lat: s.city.latitude!, lng: s.city.longitude! });
    // room for a marker and its name at every edge
    map.fitBounds(b, { top: 36, bottom: 36, left: 44, right: 44 });
  }, [map, stops, again, viewKey]);
  return null;
}

/** `k`: how much Google stretches what's drawn on the map between whole zoom levels (0.71–1.41×) — the lines and arrows
 *  are drawn that much thinner or thicker, so they look the same on every phone (they were twice as heavy on an iPhone
 *  SE as on an iPhone 15 — round 5) */
type Leg = { path: google.maps.LatLngLiteral[]; done: boolean; k: number; at: number | null };

/** The way the trip goes: a gentle arc from marker to marker, one clear arrow about the middle of each (`at`: how far
 *  along — moved off a name if it would sit on one; none on a leg too short to hold one); legs already
 *  travelled fade. (Straight lines ran through markers they didn't stop at, and a leg travelled back again laid its
 *  arrow on the other's — map review rounds 2–3.) */
function Route({ legs }: { legs: Leg[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const lines = legs.map((leg) => new google.maps.Polyline({
      path: leg.path, map, clickable: false, zIndex: 0,
      // (travelled legs a shade stronger than at first — the leg into Tokyo nearly vanished over the land; fresh review)
      strokeColor: "#8a7a63", strokeOpacity: leg.done ? 0.4 : 0.75, strokeWeight: 2.5 / leg.k,
      icons: leg.at === null ? [] : [
        // a pale edge, so the arrow reads against the line and the land
        { offset: `${(leg.at ?? 0) * 100}%`, icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 / leg.k, strokeColor: "#faf8f5", strokeWeight: 2 / leg.k, strokeOpacity: leg.done ? 0.4 : 1, fillOpacity: 0 } },
        { offset: `${(leg.at ?? 0) * 100}%`, icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.6 / leg.k, strokeColor: "#6f604c", strokeWeight: 1 / leg.k, strokeOpacity: leg.done ? 0.35 : 1, fillColor: "#6f604c", fillOpacity: leg.done ? 0.35 : 1 } },
      ],
    }));
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, legs]);
  return null;
}

/**
 * The markers. Stops that come one after the other and sit closer than a fingertip share a marker ("2 · 3"), each half
 * in its own city's color and state; stops that don't follow each other are nudged apart instead (Nagoya, 4, and Kyoto,
 * 7, made a "4 · 7" that hid where the trip ends). Each name goes on a side inside the map that covers no marker, no
 * name and — if it can — no part of the route. A tap opens the city's first day; a shared marker asks which.
 */
// Wander's own type (index.css) — inside the map Google's Roboto took over, unlike every other screen, and the names were
// measured in one font and drawn in another
const APP_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
// (a hidden span in that type — a canvas can't use the system font by name and measured a wider one)
let measuring: HTMLSpanElement | undefined;
const measurer = () => {
  if (!measuring) {
    measuring = document.createElement("span");
    measuring.setAttribute("aria-hidden", "true");
    measuring.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font-size:11px;font-family:${APP_FONT}`;
    document.body.appendChild(measuring);
  }
  return measuring;
};
/** Each stop's name measured as drawn (names medium, today's semibold, " start"/" end" and " · " regular) — what the
 *  layout needs of the page */
function measureWidths(stops: Stop[], today: string): NameWidths {
  const span = measurer();
  const width = (text: string, weight: number) => {
    span.style.fontWeight = String(weight);
    span.textContent = text;
    return span.getBoundingClientRect().width;
  };
  const tagOf = tagFor(stops);
  const byCity: NameWidths["byCity"] = {};
  for (const s of stops) {
    const tag = tagOf(s);
    byCity[s.city.id] = { w500: width(s.city.name, 500), w600: isHere(s, today) ? width(s.city.name, 600) : 0, tag: tag ? width(` ${tag}`, 400) : 0, tagAlone: tag ? width(tag, 400) : 0 };
  }
  return { dot: width(" · ", 400), byCity };
}

function Markers({ stops, order, allCities, today, noHere = false, onOpenDay, onHeight, canResize, again, onWholeTrip, viewKey, layoutKey }: {
  stops: Stop[]; order: string[]; allCities: City[]; today: string; onOpenDay: (date: string) => void; onHeight: (h: number) => void;
  /** no city is "today's stop" for this person (still at home on this Japan date) */
  noHere?: boolean;
  /** whether the map may change to this height now — growing (so no name is cut off) or after "Whole trip", but never
   *  shrinking under someone already reading Home */
  canResize: (want: number) => boolean;
  again: number; onWholeTrip: () => void;
  /** whose settled view this is, to keep for the next visit to Home */
  viewKey: string;
  /** what the stops are made of — with the view, the key to a layout already worked out */
  layoutKey: string;
}) {
  const map = useMap();
  // The view: its zoom, and where its edges are (a name must stay inside — "Tokyo · Nikko" was cut off at the right)
  const [view, setView] = useState<View | null>(null);
  const [choosing, setChoosing] = useState<Group | null>(null);
  useEffect(() => {
    if (!map) return;
    const l = map.addListener("idle", () => {
      const zoom = map.getZoom(), b = map.getBounds(), r = map.getDiv().getBoundingClientRect();
      if (zoom == null || !b) return;
      const tl = pixel(b.getNorthEast().lat(), b.getSouthWest().lng(), zoom);
      // (only a real change of view: the map says "idle" again and again with nothing moved, and each one had the whole
      // layout worked out anew)
      setView((v) => (v && Math.abs(v.zoom - zoom) < 1e-4 && Math.round(v.x0) === Math.round(tl.x) && Math.round(v.y0) === Math.round(tl.y)
        && Math.round(v.w) === Math.round(r.width) && Math.round(v.h) === Math.round(r.height)) ? v : { zoom, x0: tl.x, y0: tl.y, w: r.width, h: r.height });
    });
    return () => l.remove();
  }, [map]);

  // (this trip's stops at this view — a layout worked out before is used again)
  const viewSig = view ? `${view.zoom.toFixed(4)}|${Math.round(view.x0)}|${Math.round(view.y0)}|${Math.round(view.w)}|${Math.round(view.h)}` : "";
  // "start" and "end" beside the first and last stop's names (a ring marked the start; the end had to be worked out)
  const tagOf = useMemo(() => tagFor(stops), [stops]);

  // The markers, the route between them in the trip's order, and each name on a free side (lib/homeMapLayout.ts) — for
  // this trip, view, day and screen height. Worked out once, then kept in memory and on the phone and used again; else
  // asked of the worker, the last drawing staying on the map until it comes (markers sit by place, so they stay put).
  const namesKey = view ? `names|${shortHash(layoutKey)}|${viewSig}|${today}${noHere ? "-away" : ""}|${typeof window !== "undefined" ? window.innerHeight : 0}` : "";
  const [fromWorker, setFromWorker] = useState<{ key: string; layout: Layout } | null>(null);
  const fresh = useMemo(() => (!namesKey ? undefined
    : (kept.get(namesKey) as Layout | undefined) ?? (fromWorker?.key === namesKey ? fromWorker.layout : undefined) ?? fromPhone<Layout>(LAYOUTS_ON_PHONE, namesKey)),
  [namesKey, fromWorker]);
  // (a layout's points are pixels at the zoom it was made for — a kept-over drawing is placed with its own zoom)
  const lastDrawn = useRef<{ layout: Layout; zoom: number }>({ layout: { placed: [], drawnRoute: [] }, zoom: 0 });
  if (fresh && view) lastDrawn.current = { layout: fresh, zoom: view.zoom };
  const { placed, drawnRoute } = lastDrawn.current.layout;
  const drawnZoom = lastDrawn.current.zoom;
  useEffect(() => {
    if (!view || !namesKey || fresh) return;
    let cancelled = false;
    // (the names measured here, in Wander's type — the worker can't; estimated from their letters, "Karatsu · Hakata"
    // came out 20 pt longer than drawn — fresh review, Oct 1)
    layoutOffPage({ stops, order, view, today, noHere, innerHeight: window.innerHeight, widths: measureWidths(stops, noHere ? "" : today) }).then((layout) => {
      if (kept.size > 80) kept.clear();
      kept.set(namesKey, layout);
      toPhone(LAYOUTS_ON_PHONE, namesKey, layout, 6);
      if (!cancelled) setFromWorker({ key: namesKey, layout });
    }).catch(() => { /* the map shows without its markers' names; the next view tries again */ });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, fresh]);

  // 3. The map fitted to what's drawn: as tall as the markers and names need (plus a margin), centered on them. A few
  // steps at most — each resize redraws, and the names may move.
  // Once it's settled it stays put, so a person's pinch or drag is theirs; "Whole trip" brings the fitted view back.
  const fits = useRef(0);
  const settled = useRef<{ zoom: number; cx: number; cy: number } | null>(null);
  const [moved, setMoved] = useState(false);
  useEffect(() => { fits.current = 0; settled.current = null; setMoved(false); }, [stops, again]);
  useEffect(() => {
    // (only on the layout made for this view — a drawing kept over from the last view would fit the map to the wrong place)
    if (!map || !view || !fresh?.placed.length) return;
    const { placed, drawnRoute } = fresh;
    const cxNow = view.x0 + view.w / 2, cyNow = view.y0 + view.h / 2;
    if (settled.current) {
      const s = settled.current, k = 2 ** (view.zoom - s.zoom);
      setMoved(Math.abs(view.zoom - s.zoom) > 0.05 || Math.hypot(cxNow - s.cx * k, cyNow - s.cy * k) > 20);
      return;
    }
    // (kept for the next visit to Home: shown just so, not fitted again — at `height`, the height it should have)
    const settle = (height = view.h) => {
      settled.current = { zoom: view.zoom, cx: cxNow, cy: cyNow };
      const c = map.getCenter();
      if (c) keepSettledView(viewKey, { height, zoom: view.zoom, center: c.toJSON() });
    };
    // (back on Home with the view kept from last time: it's already settled)
    if (fits.current === 0 && again === 0 && settledView(viewKey)) {
      const kept = settledView(viewKey)!;
      if (Math.abs(kept.zoom - view.zoom) < 0.01 && Math.abs(kept.height - view.h) <= 2) { settled.current = { zoom: view.zoom, cx: cxNow, cy: cyNow }; return; }
    }
    // (the lines too: a leg arcing below the names ran into Google's credit)
    const boxes = [...placed.map((p) => p.spot.box), ...placed.map(({ group: g }) => ({ x1: g.x - 14, y1: g.y - 14, x2: g.x + 14, y2: g.y + 14 })),
      ...drawnRoute.flatMap(({ pts }) => pts.map((p) => ({ x1: p.x - 3, y1: p.y - 3, x2: p.x + 3, y2: p.y + 3 })))];
    const top = Math.min(...boxes.map((b) => b.y1)), bottom = Math.max(...boxes.map((b) => b.y2));
    const left = Math.min(...boxes.map((b) => b.x1)), right = Math.max(...boxes.map((b) => b.x2));
    const want = Math.round(Math.min(window.innerHeight * 0.4, Math.max(200, bottom - top + 16 + GOOGLE_STRIP)));
    // centered in the part above Google's strip
    // (8 above the content, 8 + the strip below it: the view's middle is half the strip below the content's)
    const cx = (left + right) / 2, cy = (top + bottom) / 2 + GOOGLE_STRIP / 2;
    const off = Math.abs(cx - (view.x0 + view.w / 2)) > 6 || Math.abs(cy - (view.y0 + view.h / 2)) > 6;
    // (never shrinking under someone already reading Home: the map keeps its height this visit — its content centred — and
    // the right height is kept for next time; re-audit 2: on a first open the map settled late and shrank, moving the page)
    const resizable = canResize(want);
    if (fits.current >= 4) { settle(resizable ? view.h : want); return; }
    if ((Math.abs(want - view.h) <= 6 || !resizable) && !off) { settle(resizable ? view.h : want); return; }
    fits.current++;
    if (resizable) onHeight(want);
    map.setCenter(place(cx, cy, view.zoom));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, view, fresh, onHeight, again, viewKey]);

  // During the trip: today's city dark, the ones already visited quieter; before it, the start ringed
  const tripStarted = stops.some((s) => s.firstDay && s.firstDay <= today);
  const stateOf = (s: Stop) =>
    !noHere && s.firstDay && s.lastDay && s.firstDay <= today && today <= s.lastDay ? "here" as const
      : tripStarted && s.lastDay && s.lastDay < today ? "past" as const : "ahead" as const;
  // a leg is travelled once its stop has been reached
  const legs = useMemo(() => drawnRoute.map(({ pts, arrive, at }) => ({
    // (Google sets an arrow's tip at its place and draws its body behind it, so it's moved on by half its length, about
    // 4.5 pt, to sit centred where it was judged — on Tokyo → Nikko its base sat against Tokyo's marker; fresh review)
    at: at === null ? null : Math.min(1, at + 4.5 / Math.max(1, pts.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0))),
    path: pts.map((p) => place(p.x, p.y, drawnZoom)),
    done: !!arrive.firstDay && arrive.firstDay <= today,
    // (Google draws at the nearest whole zoom and stretches the picture: measured Oct 1 — iPhone SE 1.41×, iPhone 15
    // 0.73×, iPad 0.86×)
    k: 2 ** (view!.zoom - Math.round(view!.zoom)),
  })), [drawnRoute, drawnZoom, view, today]);

  return (
    <>
      <Route legs={legs} />
      {moved && map && createPortal(
        <button type="button" onClick={onWholeTrip} style={{ fontFamily: APP_FONT }}
          className="absolute top-2 right-2 z-10 min-h-[44px] px-3 rounded-full bg-white/95 border border-[#e0d8cc] shadow text-sm text-[#514636]">
          Whole trip
        </button>,
        map.getDiv(),
      )}
      {placed.map(({ group, spot, gap }) => {
        const anyHere = group.stops.some((s) => stateOf(s) === "here");
        const soloHere = group.stops.length === 1 && anyHere;
        const isStart = group.stops.some((s) => s.visits.includes(1)) && !tripStarted;
        // A city opens on today when the trip is there today, otherwise on its first day (tapping Tokyo on Oct 16 opened
        // Oct 13 — a glance showed the wrong day's plan; tester t2)
        const dayFor = (s: Stop) => (stateOf(s) === "here" ? today : s.firstDay);
        const open = () => (group.stops.length > 1 ? setChoosing(group) : dayFor(group.stops[0]) && onOpenDay(dayFor(group.stops[0])!));
        const label = group.stops.map((s) => `${s.city.name}, stop ${s.visits.join(" and ")}${s.firstDay ? `, from ${shortDay(s.firstDay)}` : ""}${stateOf(s) === "here" ? " — today's stop" : ""}`).join("; ");
        return (
          <Overlay key={group.stops.map((s) => s.city.id).join("+")} lat={group.lat} lng={group.lng} z={anyHere ? 3 : 2}>
            <button type="button" onClick={open} aria-label={label} title={group.stops.map((s) => s.city.name).join(" · ")}
              className="relative flex items-center justify-center select-none [-webkit-touch-callout:none]"
              style={{ width: Math.max(TOUCH, gap * 2), height: TOUCH, transform: "translate(-50%, -50%)", fontFamily: APP_FONT }}>
              {/* the marker: one segment per stop, in its city's color and state */}
              <span className="flex rounded-full overflow-hidden"
                style={{ border: `1.5px solid ${anyHere || isStart ? INK : "#8a7a63"}`, boxShadow: isStart ? `0 0 0 2px white, 0 0 0 3.5px ${INK}` : "0 1px 3px rgba(58,49,40,0.3)" }}>
                {group.stops.flatMap((s) => s.visits.map((v) => {
                  const st = stateOf(s);
                  return (
                    <span key={v} className="flex items-center justify-center font-semibold leading-none"
                      style={{
                        width: group.stops.length > 1 || s.visits.length > 1 ? SEGMENT : MARKER - 3, height: MARKER - 3, fontSize: 11,
                        backgroundColor: st === "here" ? INK : st === "past" ? "#e7e1d7" : getCityPastel(allCities, s.city.id),
                        color: st === "here" ? "white" : st === "past" ? "#8a7d6a" : "#3a3128",
                        // a fine line between the halves of a shared marker (a pale half read as half-empty — round 7)
                        boxShadow: v !== group.stops[0].visits[0] ? "inset 1px 0 0 rgba(138,122,99,0.45)" : undefined,
                      }}>{v}</span>
                  );
                }))}
              </span>
              <span aria-hidden
                // (part of the button: tapping a city's name opens it too — tester t1)
                // (today's city alone in its name: the whole name dark — a dark chip inside a pale one looked like a slip;
                // fresh review)
                className={`absolute whitespace-nowrap rounded px-1.5 text-[11px] ${soloHere ? "bg-[#514636]" : "bg-[#faf8f5]/90"} shadow-[0_0_0_0.5px_rgba(58,49,40,0.15)] ${spot.stacked
                  // (stacked: each name on its own line, set toward the marker)
                  // (a lone stop's name over its "start"/"end" reads from the left — "Okayama" over a right-set "start"
                  // looked stiff on a Pro Max; fresh review, Oct 2)
                  ? `leading-[16px] py-px ${group.stops.length === 1 ? "text-left" : spot.h === "right" ? "text-right" : spot.h === "center" ? "text-center" : "text-left"}` : "leading-[18px]"}`}
                style={{
                  ...(spot.h === "left" ? { left: `calc(50% + ${spot.hd}px)` } : spot.h === "right" ? { right: `calc(50% + ${spot.hd}px)` } : { left: "50%" }),
                  ...(spot.v === "top" ? { top: `calc(50% + ${spot.vd}px)` } : spot.v === "bottom" ? { bottom: `calc(50% + ${spot.vd}px)` } : { top: "50%" }),
                  transform: `${spot.h === "center" ? "translateX(-50%)" : ""} ${spot.v === "middle" ? "translateY(-50%)" : ""}`.trim() || undefined,
                }}>
                {group.stops.map((s, i) => {
                  const st = stateOf(s);
                  const end = tagOf(s);
                  return (
                    <span key={s.city.id} className={spot.stacked ? "block" : undefined}>{i > 0 && !spot.stacked && <span className="text-[#8a7d6a]"> · </span>}
                      {/* today's city: a dark chip, so "where are we now" doesn't rest on half a marker (round 4) */}
                      <span className={soloHere ? "font-semibold text-white" : st === "here" ? "font-semibold text-white bg-[#514636] rounded px-1 -mx-0.5"
                        // (only places already visited go quiet — "Nikko", still ahead, looked visited; round 7)
                        : st === "past" ? "text-[#8a7d6a]" : "font-medium text-[#3a3128]"}>{s.city.name}</span>
                      {/* (the secondary text color — lighter, "start"/"end" were hard for older eyes; round 8) */}
                      {/* (…and as quiet as its name once visited — "start" stayed darker than a faded "Okayama"; fresh review) */}
                      {end && (spot.stacked && group.stops.length === 1
                        ? <span className={`block ${st === "past" ? "text-[#a39886]" : "text-[#6b5d4a]"}`}>{end}</span>
                        : <span className={st === "past" ? "text-[#a39886]" : "text-[#6b5d4a]"}> {end}</span>)}
                    </span>
                  );
                })}
              </span>
            </button>
          </Overlay>
        );
      })}
      {choosing && (
        <MapCard title={choosing.stops.map((s) => s.city.name).join(" and ")} onClose={() => setChoosing(null)}>
          {choosing.stops.map((s) => (
            <button key={s.city.id} type="button" onClick={() => { setChoosing(null); const d = stateOf(s) === "here" ? today : s.firstDay; if (d) onOpenDay(d); }}
              className="w-full min-h-[48px] flex items-center justify-between gap-3 px-4 text-left text-[15px] text-[#3a3128] border-t border-[#e0d8cc]">
              <span className="flex items-center gap-2">
                {/* the same color as this city's half of the marker */}
                <span aria-hidden className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold border border-[#8a7a63]"
                  style={{ backgroundColor: stateOf(s) === "here" ? INK : stateOf(s) === "past" ? "#e7e1d7" : getCityPastel(allCities, s.city.id), color: stateOf(s) === "here" ? "white" : "#3a3128" }}>
                  {s.visits.join("·")}
                </span>
                <span>{s.city.name}{stateOf(s) === "here" && <span className="text-[#6b5d4a]"> — today's stop</span>}</span>
              </span>
              {/* (today's city opens today, so it says so — "from Oct 13" opened Oct 16; tester k1) */}
              <span className="text-sm text-[#6b5d4a] whitespace-nowrap">{stateOf(s) === "here" ? "today" : s.firstDay ? `from ${shortDay(s.firstDay)}` : ""} ›</span>
            </button>
          ))}
        </MapCard>
      )}
    </>
  );
}

/** Which of a shared marker's cities: a sheet from the foot of the screen, everything behind it dimmed (a tap there
 *  closes it — only the map dimmed, the page below looked still live; map review round 3) */
function MapCard({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  // Back (and Escape) close the sheet, not Home (tester t4)
  useBackToClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#3a3128]/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-xl border-t border-[#e0d8cc] pb-[calc(env(safe-area-inset-bottom,0px)+8px)]" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pl-4">
          <p className="text-[15px] font-medium text-[#3a3128]">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] text-xl text-[#6b5d4a]">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Anything drawn at a place on the map (Wander's own markers — see the note at the top) */
function Overlay({ lat, lng, z, children }: { lat: number; lng: number; z: number; children: ReactNode }) {
  const map = useMap();
  const [el] = useState(() => { const d = document.createElement("div"); d.style.position = "absolute"; return d; });
  useEffect(() => {
    if (!map) return;
    el.style.zIndex = String(z);
    class At extends google.maps.OverlayView {
      // (touches on a marker or name reach the map too: kept from it, a pinch or two-finger drag starting on one did
      // nothing, and on a small map covered by names the map seemed unsure whether two fingers were down — Ken's
      // iPhone check, Oct 2. A tap still opens the marker's day.)
      onAdd() { this.getPanes()!.overlayMouseTarget.appendChild(el); }
      draw() {
        const p = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(lat, lng));
        if (p) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; }
      }
      onRemove() { el.remove(); }
    }
    const o = new At();
    o.setMap(map);
    return () => o.setMap(null);
  }, [map, el, lat, lng, z]);
  return createPortal(children, el);
}
