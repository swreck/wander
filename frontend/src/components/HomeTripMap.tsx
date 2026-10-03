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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import type { City, Day } from "../lib/types";
import { getCityPastel } from "../lib/cityColors";
import { guideData } from "../lib/guideData";
import { tripToday } from "../lib/tripNotes";
import useBackToClose from "../hooks/useBackToClose";

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
const MARKER = 22;        // a marker's size, in points
const TOUCH = 44;         // two markers closer than a fingertip are nudged apart
// Stops one after the other share a marker when theirs would overlap (or the trip doubles back through them, below); a
// fingertip apart otherwise they're nudged instead
// (merged at 44, Tokyo and Nikko — 41 pt apart on an iPhone 15 — made "5 | 6", and the leg back to Kyoto had to cross
// the only place for its name; 45 pt apart on a Pro Max they were two markers and clean; fresh review, Oct 1)
const MERGE = 30;
const SEGMENT = 20;       // one stop's part of a shared marker
const ARROW_AT = [0.5, 0.42, 0.58, 0.35, 0.65]; // where along a leg its arrow may sit, the middle first
const BOWS = [0.14, -0.14, 0.28, -0.28, 0.42, -0.42, 0.56, -0.56]; // how deep a leg may arc, the gentlest first
const STUB = 20;        // how strongly a leg leaving a shared marker heads straight up or down before it bends away
const GOOGLE_STRIP = 28;  // Google's logo and data credit along the map's foot — never covered

type Stop = { city: City; visits: number[]; firstDay: string | null; lastDay: string | null };
/** One marker: one stop, or stops that come one after the other and sit closer than a fingertip. `x`/`y`: where it's
 *  drawn, in pixels at the current zoom (nudged off a non-consecutive neighbour); `lat`/`lng`: the same point. */
type Group = { stops: Stop[]; x: number; y: number; lat: number; lng: number };

/** Where a point sits, in pixels, at a zoom (Web Mercator — what Google draws) */
function pixel(lat: number, lng: number, zoom: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

/** …and back: the place at a pixel */
function place(x: number, y: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI, lng: (x / scale) * 360 - 180 };
}

const shortDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** `cities`: the cities the map shows (in Japan, located); `allCities`: the trip's whole list, for the calendar colors */
export default function HomeTripMap({ tripId, cities, allCities, days, onOpenDay }: {
  tripId: string; cities: City[]; allCities: City[]; days: Day[]; onOpenDay: (date: string) => void;
}) {
  const [zone, setZone] = useState("Asia/Tokyo");
  useEffect(() => { guideData(tripId).then((g) => g?.trip.timeZone && setZone(g.trip.timeZone)).catch(() => { /* Japan time */ }); }, [tripId]);
  const today = tripToday(zone);

  // The stops in the order they're visited (each change of city is a stop; a city visited twice has two numbers)
  const { stops, order } = useMemo(() => {
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
  }, [cities, days]);

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
  // place as empty sea — map review round 4)
  const [fitted, setFitted] = useState<number | null>(null);
  const height = fitted ?? estimate;
  // "Whole trip": back to the fitted view after a pinch or a drag (there was no way back but leaving Home — tester t4)
  const [refit, setRefit] = useState(0);

  if (!API_KEY || stops.length === 0) return null;
  return (
    <div className="relative bg-[#e8e1d2]" style={{ height }}>
      <APIProvider apiKey={API_KEY}>
        <GoogleMap
          defaultCenter={{ lat: stops[0].city.latitude!, lng: stops[0].city.longitude! }}
          defaultZoom={6}
          styles={MAP_STYLE}
          isFractionalZoomEnabled
          gestureHandling="cooperative"
          disableDefaultUI
          clickableIcons={false}
          keyboardShortcuts={false}
          backgroundColor="#e8e1d2"
          style={{ width: "100%", height: "100%" }}
        >
          <Fit stops={stops} again={refit} />
          <Markers stops={stops} order={order} allCities={allCities} today={today} onOpenDay={onOpenDay} onHeight={setFitted}
            again={refit} onWholeTrip={() => setRefit((n) => n + 1)} />
        </GoogleMap>
      </APIProvider>
    </div>
  );
}

/** The view: the trip's cities, filling the map */
function Fit({ stops, again }: { stops: Stop[]; again: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (stops.length === 1) { map.setCenter({ lat: stops[0].city.latitude!, lng: stops[0].city.longitude! }); map.setZoom(10); return; }
    const b = new google.maps.LatLngBounds();
    for (const s of stops) b.extend({ lat: s.city.latitude!, lng: s.city.longitude! });
    // room for a marker and its name at every edge
    map.fitBounds(b, { top: 36, bottom: 36, left: 44, right: 44 });
  }, [map, stops, again]);
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

function Markers({ stops, order, allCities, today, onOpenDay, onHeight, again, onWholeTrip }: {
  stops: Stop[]; order: string[]; allCities: City[]; today: string; onOpenDay: (date: string) => void; onHeight: (h: number) => void;
  again: number; onWholeTrip: () => void;
}) {
  const map = useMap();
  // The view: its zoom, and where its edges are (a name must stay inside — "Tokyo · Nikko" was cut off at the right)
  const [view, setView] = useState<{ zoom: number; x0: number; y0: number; w: number; h: number } | null>(null);
  const [choosing, setChoosing] = useState<Group | null>(null);
  useEffect(() => {
    if (!map) return;
    const l = map.addListener("idle", () => {
      const zoom = map.getZoom(), b = map.getBounds(), r = map.getDiv().getBoundingClientRect();
      if (zoom == null || !b) return;
      const tl = pixel(b.getNorthEast().lat(), b.getSouthWest().lng(), zoom);
      setView({ zoom, x0: tl.x, y0: tl.y, w: r.width, h: r.height });
    });
    return () => l.remove();
  }, [map]);

  // 1. The markers, and the route between them in the trip's order
  const { groups, route, routeCost } = useMemo(() => {
    if (!view) return { groups: [] as Group[], route: [] as { pts: { x: number; y: number }[]; arrive: Stop; tries: { x: number; y: number }[][]; at: number | null }[], routeCost: () => 0 };
    const z = view.zoom;
    const groups: Group[] = [];
    for (const s of [...stops].sort((a, b) => a.visits[0] - b.visits[0])) {
      const p = pixel(s.city.latitude!, s.city.longitude!, z);
      const follows = (g: Group) => g.stops.some((o) => o.visits.some((v) => s.visits.some((w) => Math.abs(v - w) === 1)));
      // …or, a fingertip apart, when the trip doubles back through them: in from one side and straight on to the next
      // stop on that same side (on an iPad Karatsu and Hakata as two markers made a narrow V with an arrow squeezed
      // between them; Tokyo → Nikko turns a corner instead, and stays two markers — fresh review, Oct 1)
      const at = (o: Stop) => pixel(o.city.latitude!, o.city.longitude!, z);
      const doublesBack = (g: Group) => g.stops.some((o) => o.visits.some((v) => {
        const before = stops.find((x) => x.visits.includes(v - 1));
        if (!before || !s.visits.includes(v + 1)) return false;
        const a = at(o), b = at(before);
        const d = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(p.y - a.y, p.x - a.x)) % (2 * Math.PI);
        return Math.min(d, 2 * Math.PI - d) < Math.PI / 3;
      }));
      const near = groups.find((g) => {
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        return follows(g) && (d < MERGE || (d < TOUCH && doublesBack(g)));
      });
      if (near) {
        near.stops.push(s);
        const pts = near.stops.map((o) => pixel(o.city.latitude!, o.city.longitude!, z));
        near.x = pts.reduce((t, q) => t + q.x, 0) / pts.length;
        near.y = pts.reduce((t, q) => t + q.y, 0) / pts.length;
      } else groups.push({ stops: [s], x: p.x, y: p.y, lat: 0, lng: 0 });
    }
    // markers that don't share but would touch: pushed apart, a little at a time
    const widthOf = (g: Group) => g.stops.reduce((t, s) => t + s.visits.length, 0) * SEGMENT + 3;
    for (let pass = 0; pass < 20; pass++) {
      let moved = false;
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i], b = groups[j];
        const need = TOUCH + (Math.max(widthOf(a), widthOf(b)) - MARKER) / 2;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d >= need) continue;
        const ux = d ? (b.x - a.x) / d : 1, uy = d ? (b.y - a.y) / d : 0, push = (need - d) / 2 + 0.5;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        moved = true;
      }
      if (!moved) break;
    }
    for (const g of groups) Object.assign(g, place(g.x, g.y, z));
    // The route: marker to marker in the trip's order (stops sharing a marker have no leg between them)
    // (each hop: the marker, the stop number it's reached at, and the one it's left from — "2 | 3" is reached at 2 and
    // left from 3, so the leg in meets the "2" half and the leg out leaves the "3" half; on a wide map the two legs
    // ran together into one line — map review round 5)
    const hops: { g: Group; arrive: Stop; arriveV: number; departV: number }[] = [];
    order.forEach((id, i) => {
      const g = groups.find((x) => x.stops.some((s) => s.city.id === id));
      if (!g) return;
      const last = hops[hops.length - 1];
      if (last?.g === g) last.departV = i + 1;
      else hops.push({ g, arrive: g.stops.find((s) => s.city.id === id)!, arriveV: i + 1, departV: i + 1 });
    });
    // A leg meets a shared marker at its own half, on the edge (top or bottom) its arc comes in from — from the half's
    // middle, a line out of "6" ran under "5" and seemed to leave from Tokyo; and a leg out and a leg back, both on the
    // top edge, read as one line (map review rounds 6–7)
    const shared = (g: Group) => g.stops.reduce((t, s) => t + s.visits.length, 0) > 1;
    const halfX = (g: Group, v: number) => {
      const list = g.stops.flatMap((s) => s.visits);
      return list.length < 2 ? g.x : g.x + (list.indexOf(v) - (list.length - 1) / 2) * SEGMENT;
    };
    const edge = (g: Group, x: number, towardY: number) => ({ x, y: shared(g) ? g.y + (towardY < g.y ? -1 : 1) * (MARKER / 2) : g.y });
    // Each leg a gentle arc, bowing to the left of the way it goes — so a leg travelled back again bows the other way —
    // or, if that passes over a marker it doesn't stop at, the other way or deeper
    type Pt = { x: number; y: number };
    const legArcs = hops.slice(1).map(({ g: bg, arrive, arriveV }, i) => {
      const ag = hops[i].g;
      const a0 = { x: halfX(ag, hops[i].departV), y: ag.y }, b0 = { x: halfX(bg, arriveV), y: bg.y };
      const dx = b0.x - a0.x, dy = b0.y - a0.y, len = Math.hypot(dx, dy) || 1;
      const nx = dy / len, ny = -dx / len, mx = (a0.x + b0.x) / 2, my = (a0.y + b0.y) / 2;
      const arc = (k: number, stub: number, slant = false) => {
        // (in proportion to the leg — a fixed cap left long iPad legs almost straight, and two legs out of one marker
        // ran together)
        const bow = Math.sign(k) * Math.min(180, Math.max(10, Math.abs(k) * len));
        const cx = mx + nx * bow, cy = my + ny * bow;
        // the ends on the edge the arc comes in from (its curve heads toward the control point)
        const a = edge(ag, a0.x, cy), b = edge(bg, b0.x, cy);
        // …and with `stub`, at a shared marker it leaves that edge heading straight out (or, `slant`, out and toward
        // where it's going), then bends into the arc — so it can climb off the marker rather than run along its border,
        // or leave room beside it for its name; used only when it does (as the rule, straight out made elbows on a
        // phone; fresh review, Oct 1)
        // (the arc as a cubic: the plain curve's own handles, except a shared end's when it heads out)
        const handle = (g: Group, p: Pt) => {
          if (!shared(g) || !stub) return { x: p.x + (2 / 3) * (cx - p.x), y: p.y + (2 / 3) * (cy - p.y) };
          const out = Math.sign(p.y - g.y), side = slant ? Math.sign(cx - p.x) * 0.7 : 0;
          return { x: p.x + side * stub, y: p.y + out * (slant ? 0.7 : 1) * stub };
        };
        const h1 = handle(ag, a), h2 = handle(bg, b);
        return Array.from({ length: 33 }, (_, t) => {
          const u = t / 32, v = 1 - u;
          return { x: v ** 3 * a.x + 3 * v * v * u * h1.x + 3 * v * u * u * h2.x + u ** 3 * b.x, y: v ** 3 * a.y + 3 * v * v * u * h1.y + 3 * v * u * u * h2.y + u ** 3 * b.y };
        });
      };
      // the gentlest first; then each again leaving a shared marker on a slant (straight out made hooks and elbows)
      // (to 0.56: at 0.42 the leg out of Hakata on an iPhone 15 couldn't dip far enough to clear "Karatsu · Hakata")
      const bows = BOWS;
      return { ag, bg, arrive, tries: [...bows.map((k) => arc(k, 0)), ...bows.map((k) => arc(k, STUB * 1.4, true))] };
    });
    const clearance = (pts: Pt[], ag: Group, bg: Group) => Math.min(Infinity, ...groups.filter((o) => o !== ag && o !== bg).map((o) => Math.min(...pts.map((p) => Math.hypot(p.x - o.x, p.y - o.y))) - (o.stops.length * SEGMENT) / 2));
    // how much of an arc runs alongside the legs before it (on an iPad the leg into Karatsu and the leg out of Hakata,
    // both toward Okayama's side, ran together as one doubled line — map review round 7)
    // (measured to the drawn line itself, not its sample points — on a long iPad leg those are 40 px apart)
    const toSeg = (p: Pt, a: Pt, b: Pt) => {
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
      return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
    };
    const alongside = (pts: Pt[], ag: Group, bg: Group, before: Pt[][]) => {
      let n = 0;
      for (let i = 1; i < pts.length; i++) for (let k = 1; k <= 4; k++) {
        const p = { x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 4, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / 4 };
        // (right by the markers it joins, legs are close by nature — that doesn't count)
        if (Math.hypot(p.x - ag.x, p.y - ag.y) < 30 || Math.hypot(p.x - bg.x, p.y - bg.y) < 30) continue;
        if (before.some((leg) => leg.some((q, j) => j > 0 && toSeg(p, leg[j - 1], q) < 8))) n++;
      }
      return n;
    };
    // A shared marker's legs use different edges (one in at the top, one out at the bottom) wherever an arc allows —
    // on an iPad both legs met "2 | 3" at the top and you couldn't tell which city each belonged to (round 8)
    const edgeAt = (g: Group, p: { y: number }) => (p.y < g.y ? "top" : "bottom");
    // …and leaves it, rather than running along its border (the leg out of Nikko ran just above the whole of "5 | 6" and
    // looked misattached — fresh review, Oct 1)
    const hugs = (pts: Pt[], g: Group) => {
      if (!shared(g)) return false;
      const end = Math.hypot(pts[0].x - g.x, pts[0].y - g.y) < Math.hypot(pts[pts.length - 1].x - g.x, pts[pts.length - 1].y - g.y) ? pts[0] : pts[pts.length - 1];
      return pts.some((p, i) => [p, i ? { x: (p.x + pts[i - 1].x) / 2, y: (p.y + pts[i - 1].y) / 2 } : p].some((q) =>
        Math.hypot(q.x - end.x, q.y - end.y) > 10 && Math.abs(q.x - g.x) < widthOf(g) / 2 + 5 && Math.abs(q.y - g.y) < MARKER / 2 + 5));
    };
    // How far a whole set of arcs (one per leg) is from these rules — 0 when it keeps them all; used here to choose
    // each leg in turn, and by the names (2.) to judge trying another arc
    // …and where two legs cross, away from the markers where legs meet anyway (with Karatsu and Hakata apart on an iPad,
    // the leg to Nagoya swung north and crossed the leg back to Kyoto; fresh review, Oct 1)
    const crossings = (p: Pt[], q: Pt[]) => {
      const turn = (a: Pt, b: Pt, c: Pt) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      const atMarker = (a: Pt) => groups.some((g) => Math.hypot(a.x - g.x, a.y - g.y) < 20);
      let n = 0;
      for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) {
        const a = p[i - 1], b = p[i], c = q[j - 1], d = q[j];
        if (turn(a, b, c) !== turn(a, b, d) && turn(c, d, a) !== turn(c, d, b) && !atMarker(a)) n++;
      }
      return n;
    };
    // …and where a leg arrives at a marker and the next leaves it, at clearly different angles (on an iPad the leg into
    // Karatsu and the leg out to Hakata met it at one point, a narrow V that read as one line hooking back; fresh review)
    const heading = (pts: Pt[], g: Group, fromEnd: boolean) => {
      const seq = fromEnd ? [...pts].reverse() : pts;
      // (measured well out from the marker, where the eye reads the V — 22 pt out, a 22° V passed as 35° — but on a
      // short leg no further than 40% along it, or it only measures the straight line to the next marker)
      const out = Math.min(34, 0.4 * Math.hypot(seq[seq.length - 1].x - g.x, seq[seq.length - 1].y - g.y));
      const p = seq.find((q) => Math.hypot(q.x - g.x, q.y - g.y) >= out) ?? seq[seq.length - 1];
      return Math.atan2(p.y - g.y, p.x - g.x);
    };
    const narrow = (into: Pt[], out: Pt[], g: Group) => {
      if (shared(g)) return false;
      const d = Math.abs(heading(into, g, true) - heading(out, g, false)) % (2 * Math.PI);
      return Math.min(d, 2 * Math.PI - d) < (40 * Math.PI) / 180;
    };
    // …and inside the map, clear of Google's logo and credit — above or below allowed while the map can still grow to
    // take it in, as for names (a deep arc out of Hakata ran into Google's credit; fresh review, Oct 1)
    const room = Math.max(0, Math.round(window.innerHeight * 0.4) - view.h) / 2;
    const outside = (pts: Pt[]) => pts.some((p) => p.x < view.x0 + 4 || p.x > view.x0 + view.w - 4
      || p.y < view.y0 + 4 - room || p.y > view.y0 + view.h - GOOGLE_STRIP - 4 + room);
    // …and meets a split marker's top or bottom squarely: steep for its last stretch, without curling in at the end (the
    // leg from Okayama grazed the top of "2" on the phones and hooked into it on a Pro Max; fresh review, Oct 1)
    const askew = (pts: Pt[], g: Group, atEnd: boolean) => {
      if (!shared(g)) return false;
      const seq = atEnd ? [...pts].reverse() : pts, end = seq[0];
      const dir = (r: number) => {
        const p = seq.find((q) => Math.hypot(q.x - end.x, q.y - end.y) >= r) ?? seq[seq.length - 1];
        return Math.atan2(Math.abs(p.y - end.y), Math.abs(p.x - end.x) || 1e-6);
      };
      const near = dir(5), far = dir(16);
      return near < Math.PI / 6 || far < Math.PI / 6 || Math.abs(near - far) > (35 * Math.PI) / 180;
    };
    const routeCost = (all: Pt[][]) => {
      let cost = 0;
      const edges = new Map<Group, string[]>();
      all.forEach((pts, i) => {
        const { ag, bg } = legArcs[i];
        if (outside(pts)) cost += 300;
        if (askew(pts, ag, false)) cost += 300;
        if (askew(pts, bg, true)) cost += 300;
        for (const before of all.slice(0, i)) cost += crossings(pts, before) * 300;
        if (i > 0 && legArcs[i - 1].bg === ag && narrow(all[i - 1], pts, ag)) cost += 300;
        cost += (clearance(pts, ag, bg) >= 8 ? 0 : 1000) + alongside(pts, ag, bg, all.slice(0, i)) * 20 + ((hugs(pts, ag) ? 300 : 0) + (hugs(pts, bg) ? 300 : 0));
        for (const [g, p] of [[ag, pts[0]], [bg, pts[pts.length - 1]]] as const) {
          if (!shared(g)) continue;
          const seen = edges.get(g) ?? [];
          if (seen.includes(edgeAt(g, p))) cost += 300;
          edges.set(g, [...seen, edgeAt(g, p)]);
        }
      });
      return cost;
    };
    const chosen: Pt[][] = [];
    for (const leg of legArcs) {
      const costs = leg.tries.map((p, i) => routeCost([...chosen, p]) + i);
      chosen.push(leg.tries[costs.indexOf(Math.min(...costs))]);
    }
    // Chosen in order, an early leg can corner a later one (on an iPad the leg back to Kyoto had nowhere but across the
    // leg to Nagoya): when a rule is still broken, each leg is tried again with all the others in place
    const gentle = (all: Pt[][]) => all.reduce((t, p, i) => t + legArcs[i].tries.indexOf(p), 0);
    let worst = routeCost(chosen) + gentle(chosen);
    for (let pass = 0; pass < 3 && routeCost(chosen) > 0; pass++) {
      let better = false;
      legArcs.forEach((leg, i) => leg.tries.forEach((p) => {
        const all = chosen.map((q, j) => (j === i ? p : q));
        const c = routeCost(all) + gentle(all);
        if (c < worst) { chosen[i] = p; worst = c; better = true; }
      }));
      if (!better) break;
    }
    // …and, if still, two legs at once (to clear that crossing the leg into Karatsu had to bow north while the one out
    // of Hakata bowed south — either alone made things worse)
    if (routeCost(chosen) > 0) {
      for (let i = 0; i < legArcs.length; i++) for (let j = i + 1; j <= i + 2 && j < legArcs.length; j++)
        for (const p of legArcs[i].tries.slice(0, BOWS.length)) for (const q of legArcs[j].tries.slice(0, BOWS.length)) {
          const all = chosen.map((r, k) => (k === i ? p : k === j ? q : r));
          const c = routeCost(all) + gentle(all);
          if (c < worst) { chosen[i] = p; chosen[j] = q; worst = c; }
        }
    }
    // A leg with too little line showing between its markers to hold an arrow has none — the numbers say which way
    // (the narrow V at Karatsu on an iPad, where an arrow sat wedged, is kept away by the angle rule above)
    const shown = (pts: Pt[], ag: Group, bg: Group) =>
      pts.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0) - (shared(ag) ? 0 : MARKER / 2) - (shared(bg) ? 0 : MARKER / 2);
    const route = legArcs.map((leg, i) => ({ pts: chosen[i], arrive: leg.arrive, tries: leg.tries, at: shown(chosen[i], leg.ag, leg.bg) < 16 ? null : 0.5 as number | null }));
    return { groups, route, routeCost };
  }, [stops, order, view]);

  // "start" and "end" beside the first and last stop's names (a ring marked the start; the end had to be worked out)
  const lastVisit = Math.max(0, ...stops.flatMap((s) => s.visits));
  const tagOf = useCallback((s: Stop) => (s.visits.includes(1) ? "start" : s.visits.includes(lastVisit) ? "end" : ""), [lastVisit]);
  // A name's width, measured in its own type (estimated from its letters, "Karatsu · Hakata" came out 20 pt longer than
  // drawn, and the name was judged to sit on an arrow past its end — fresh review, Oct 1)
  const nameWidth = useCallback((g: Group) => {
    const span = measurer();
    const width = (text: string, weight: number) => {
      span.style.fontWeight = String(weight);
      span.textContent = text;
      return span.getBoundingClientRect().width;
    };
    // (as drawn below: names medium, today's semibold in a chip, " · " and "start"/"end" regular; 6 px each side)
    const each = g.stops.map((s) => {
      const here = !!s.firstDay && !!s.lastDay && s.firstDay <= today && today <= s.lastDay;
      return width(s.city.name, here ? 600 : 500) + (here ? 4 : 0) + (tagOf(s) ? width(` ${tagOf(s)}`, 400) : 0);
    });
    // `one`: on one line, "Tokyo · Nikko"; `stacked`: a shared marker's names one above the other — or a lone stop's
    // name over its "start" or "end"
    const lone = g.stops.length === 1 && tagOf(g.stops[0]) ? [width(g.stops[0].city.name, 500), width(tagOf(g.stops[0]), 400)] : null;
    return { one: each.reduce((t, w) => t + w, 0) + (each.length - 1) * width(" · ", 400) + 12 + 2, stacked: Math.max(...(lone ?? each)) + 12 + 2 };
  }, [tagOf, today]);

  // 2. Each name on a free side
  const { placed, drawnRoute } = useMemo(() => {
    if (!view) return { placed: [], drawnRoute: route };
    type Box = { x1: number; y1: number; x2: number; y2: number };
    const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    // (inside the map, and clear of Google's logo and credit along its foot, which must show)
    // (above or below counts as inside while the map can still grow to take it in — the fit below makes it as tall as its
    // names; on production's iPhone 15 the map sat at its 200 px least, the place under "Karatsu · Hakata" was in
    // Google's strip, and the name went onto the leg out of Hakata instead)
    const grow = Math.max(0, Math.round(window.innerHeight * 0.4) - view.h) / 2;
    const inside = (b: Box) => b.x1 >= view.x0 + 4 && b.x2 <= view.x0 + view.w - 4 && b.y1 >= view.y0 + 4 - grow && b.y2 <= view.y0 + view.h - GOOGLE_STRIP + grow;
    // a marker's half-width and half-height, with the ring round the start before the trip ("Okayama start" touched
    // the ring — fresh review, Oct 1)
    const started = stops.some((s) => s.firstDay && s.firstDay <= today);
    const ring = (g: Group) => (!started && g.stops.some((s) => s.visits.includes(1)) ? 3.5 : 0);
    const half = (g: Group) => (g.stops.reduce((t, s) => t + s.visits.length, 0) * SEGMENT + 3) / 2 + ring(g);
    const tall = (g: Group) => MARKER / 2 + ring(g);
    // names kept a little apart from one another, not just off each other ("Okayama start" and "Karatsu · Hakata"
    // read as one block 3 pt apart)
    const roomy = (b: Box): Box => ({ x1: b.x1 - 3, y1: b.y1 - 3, x2: b.x2 + 3, y2: b.y2 + 3 });
    // where a leg's arrow sits: `at` of the way along the line's length, where Google draws it (not along the curve's
    // formula, which on a lopsided arc is somewhere else; on production an arrow sat against a name the check thought
    // was clear)
    const arrowBox = (pts: { x: number; y: number }[], at: number): Box => {
      const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
      let left = seg.reduce((a, b) => a + b, 0) * at, i = 0;
      while (i < seg.length - 1 && left > seg[i]) { left -= seg[i]; i++; }
      const f = seg[i] ? left / seg[i] : 0;
      const m = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
      // (with 2 pt more room than the arrow itself — an arrow 2 pt from "Karatsu · Hakata" read as touching it)
      return { x1: m.x - 13, y1: m.y - 13, x2: m.x + 13, y2: m.y + 13 };
    };
    // (each name measured once — measuring asks the page to lay itself out)
    const sizes = new Map(groups.map((g) => [g, nameWidth(g)]));
    // every name placed with the legs drawn as `rt`; `total` is how badly the names sit (0: every one clear)
    // (`movable`: each arrow can still slide along its leg, so it's only in a name's way if it would be wherever it went)
    const nameAll = (rt: typeof route, movable = false, pairs = false) => {
      const arrowSpots = rt.filter(({ at }) => at !== null).map(({ pts, at }) => (movable ? ARROW_AT : [at!]).map((a) => arrowBox(pts, a)));
      const arrowHits = (b: Box) => arrowSpots.filter((spots) => spots.every((a) => hit(b, a))).length;
      const taken: Box[] = groups.map((g) => ({ x1: g.x - half(g) - 2, y1: g.y - tall(g) - 2, x2: g.x + half(g) + 2, y2: g.y + tall(g) + 2 }));
      // the route as points every few px, to keep names off it
      const line: { x: number; y: number }[] = [];
      for (const { pts } of rt) for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
        for (let k = 0; k <= n; k++) line.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      }
      // (filed by area, so a name looks only at the points near it — scanning them all for every place and every arc
      // tried made the map take half a second to settle)
      const CELL = 24;
      const cells = new Map<string, { x: number; y: number }[]>();
      for (const p of line) {
        const key = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
        cells.get(key)?.push(p) ?? cells.set(key, [p]);
      }
      // (with 4 px of room around a name — a line 1 pt from a name read as resting on it; round 9)
      // (graded: under a name or touching it counts in full, close by only a little — counted alike, a line hidden
      // under "Kyoto end" weighed no more than one passing 5 pt away; fresh review, Oct 1)
      const lineIn = (b: Box) => {
        let n = 0;
        for (let cx = Math.floor((b.x1 - 6) / CELL); cx <= Math.floor((b.x2 + 6) / CELL); cx++)
          for (let cy = Math.floor((b.y1 - 6) / CELL); cy <= Math.floor((b.y2 + 6) / CELL); cy++)
            for (const p of cells.get(`${cx},${cy}`) ?? []) {
              if (!(p.x > b.x1 - 6 && p.x < b.x2 + 6 && p.y > b.y1 - 6 && p.y < b.y2 + 6)) continue;
              // (close by only a twentieth: weighed higher, a line grazing a corner of "Karatsu · Hakata" was kept
              // rather than a place 4 pt from another line)
              // (and touching weighs three times: "Nagoya" 1 pt from a leg was kept as the least bad)
              n += p.x > b.x1 - 3 && p.x < b.x2 + 3 && p.y > b.y1 - 3 && p.y < b.y2 + 3 ? 3 : 0.05;
            }
        return n;
      };
      // Twelve places a name can go; each scored — outside the map or on a marker or name: never if avoidable; on an
      // arrow: hardly ever; on the line: as little as can be (names sat on the line and hid arrows — map review round 4)
      const spotsFor = (g: Group) => {
        const gx = half(g) + 3, gy = tall(g) + 3;
        type Spot = { box: Box; h: "left" | "right" | "center"; hd: number; v: "top" | "bottom" | "middle"; vd: number; stacked: boolean };
        const at = (w: number, h: number, stacked: boolean): Spot[] => [
          { box: { x1: g.x + gx, y1: g.y - h / 2, x2: g.x + gx + w, y2: g.y + h / 2 }, h: "left", hd: gx, v: "middle", vd: 0 },
          { box: { x1: g.x - gx - w, y1: g.y - h / 2, x2: g.x - gx, y2: g.y + h / 2 }, h: "right", hd: gx, v: "middle", vd: 0 },
          { box: { x1: g.x - w / 2, y1: g.y + gy, x2: g.x + w / 2, y2: g.y + gy + h }, h: "center", hd: 0, v: "top", vd: gy },
          { box: { x1: g.x - w / 2, y1: g.y - gy - h, x2: g.x + w / 2, y2: g.y - gy }, h: "center", hd: 0, v: "bottom", vd: gy },
          // beside the marker, raised or lowered a little — still touching its side (round 7: corner spots floated)
          { box: { x1: g.x + gx, y1: g.y + 4 - h, x2: g.x + gx + w, y2: g.y + 4 }, h: "left", hd: gx, v: "bottom", vd: -4 },
          { box: { x1: g.x + gx, y1: g.y - 4, x2: g.x + gx + w, y2: g.y - 4 + h }, h: "left", hd: gx, v: "top", vd: -4 },
          { box: { x1: g.x - gx - w, y1: g.y + 4 - h, x2: g.x - gx, y2: g.y + 4 }, h: "right", hd: gx, v: "bottom", vd: -4 },
          { box: { x1: g.x - gx - w, y1: g.y - 4, x2: g.x - gx, y2: g.y - 4 + h }, h: "right", hd: gx, v: "top", vd: -4 },
          // above or below, shifted to one side but still over the marker's own width (a corner spot left "Kyoto end"
          // hanging between 7 and 1 — round 9): a last resort
          { box: { x1: g.x - 6, y1: g.y + gy, x2: g.x - 6 + w, y2: g.y + gy + h }, h: "left", hd: -6, v: "top", vd: gy },
          { box: { x1: g.x + 6 - w, y1: g.y + gy, x2: g.x + 6, y2: g.y + gy + h }, h: "right", hd: -6, v: "top", vd: gy },
          { box: { x1: g.x - 6, y1: g.y - gy - h, x2: g.x - 6 + w, y2: g.y - gy }, h: "left", hd: -6, v: "bottom", vd: gy },
          { box: { x1: g.x + 6 - w, y1: g.y - gy - h, x2: g.x + 6, y2: g.y - gy }, h: "right", hd: -6, v: "bottom", vd: gy },
          // …or hanging from the marker's middle, a few points further from a leg coming in at its corner ("Nagoya" sat
          // 1 pt from the leg arriving at 4 from below left; fresh review, Oct 1)
          { box: { x1: g.x, y1: g.y + gy, x2: g.x + w, y2: g.y + gy + h }, h: "left", hd: 0, v: "top", vd: gy },
          { box: { x1: g.x - w, y1: g.y + gy, x2: g.x, y2: g.y + gy + h }, h: "right", hd: 0, v: "top", vd: gy },
          { box: { x1: g.x, y1: g.y - gy - h, x2: g.x + w, y2: g.y - gy }, h: "left", hd: 0, v: "bottom", vd: gy },
          { box: { x1: g.x - w, y1: g.y - gy - h, x2: g.x, y2: g.y - gy }, h: "right", hd: 0, v: "bottom", vd: gy },
        ].map((s) => ({ ...s, stacked } as Spot));
        // A shared marker's names may also stand one above the other — on a phone "Tokyo · Nikko" on one line was longer
        // than the room beside its marker, and every place for it lay on a line (fresh review, Oct 1); only where that
        // keeps them clear, since one line reads more easily
        const size = sizes.get(g)!;
        // (stacked only beside the marker, where the names read top to bottom as its halves read left to right — under
        // one half, "Tokyo" sat beneath the 6 and read as stop 6; fresh review, Oct 1)
        // (a lone stop's "Kyoto" over "end" may go anywhere its one line could: on the phones, with Shirakabeso placed,
        // 8 sat 50 pt from 1 with 4 to its right, the leg into Nagoya above and "Okayama start" below, and "Kyoto end" on
        // one line fitted nowhere but 1's ring — fresh review, Oct 2) — once the legs are settled, like the weight below
        const spots = [...at(size.one, 18, false), ...(g.stops.length > 1 ? at(size.stacked, 34, true).slice(0, 2) : pairs && tagOf(g.stops[0]) ? at(size.stacked, 34, true) : [])];
        // …and tight to its own marker: never nearer another marker than its own ("Kyoto end" sat between 7 and 1 and
        // could be read as either — round 5); a side spot over a corner one when they're otherwise equal
        // (measured from the name's nearest edge — from its middle, a long name touching its own marker could count as
        // "nearer" another, and "Kyoto end" was pushed onto a line; map review round 8)
        // (and to each marker's edge, as the eye sees it — to its middle, a wide "5 | 6" counted as further from its own
        // name than Nagoya's marker was, and the name was kept from the clear place beside it; fresh review, Oct 1)
        const apart = (b: Box, o: Group) => Math.hypot(Math.max(b.x1 - (o.x + half(o)), 0, o.x - half(o) - b.x2), Math.max(b.y1 - (o.y + tall(o)), 0, o.y - tall(o) - b.y2));
        const nearer = (s: Spot) => groups.some((o) => o !== g && apart(s.box, o) < apart(s.box, g));
        // (and not hanging over another marker close by — "Kyoto end" on an iPhone SE sat 15 pt above 1 and could be
        // read as its name; fresh review, Oct 1)
        const hovers = (s: Spot) => groups.some((o) => o !== g && apart(s.box, o) < 18);
        // (on a marker or a name, once the legs are settled: more than any line could weigh — at 1000, a line grazing
        // every other place near 8 came to more, and "Kyoto end" was put on 1's ring; fresh review, Oct 2. Not while the
        // legs are chosen: weighed that heavily there, the leg into Nagoya on a Pro Max swung south and crossed another.)
        const score = (s: Spot) => (inside(s.box) ? 0 : 10000) + taken.filter((t) => hit(s.box, t)).length * (pairs ? 5000 : 1000)
          // (a name on a line hides where the trip goes — weighed almost as heavily as an arrow; round 6: a leg ran under
          // "Kyoto end" and the trip seemed to pass through Kyoto)
          // (a name read as another stop's is worse than one on a line: with Shirakabeso placed, "Kyoto end" settled on
          // marker 1's ring on an iPhone SE and 15 and read as "1 = Kyoto end" — fresh review, Oct 2. Nearly as bad as
          // covering a marker, then.)
          + (nearer(s) ? 900 : hovers(s) ? 500 : 0) + arrowHits(s.box) * 200 + lineIn(s.box) * 60
          + (s.hd < 0 ? 120 : s.hd === 0 && s.h !== "center" ? 60 : s.vd < 0 ? 2 : 0) + (s.stacked ? 150 : 0);
        return { spots, score, gx };
      };
      // The name with the fewest good places goes first (Okayama's name, placed first, took the one place "Kyoto end"
      // had, which then sat at a corner nearer Nagoya — round 7)
      const goodCount = (g: Group) => { const { spots, score } = spotsFor(g); return spots.filter((s) => score(s) < 100).length; };
      const byNeed = [...groups].sort((a, b) => goodCount(a) - goodCount(b));
      const chosen = new Map<Group, { group: Group; spot: ReturnType<typeof spotsFor>["spots"][number]; gap: number }>();
      const markerBoxes = taken.slice();
      for (const g of byNeed) {
        const { spots, score, gx } = spotsFor(g);
        const best = spots.reduce((b, s) => (score(s) < score(b) ? s : b));
        taken.push(roomy(best.box));
        chosen.set(g, { group: g, spot: best, gap: gx });
      }
      // Then each name is tried again with the others where they are, until none moves (a name placed early can step
      // aside for one that has nowhere else to go)
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (const g of byNeed) {
          taken.length = 0;
          taken.push(...markerBoxes, ...byNeed.filter((o) => o !== g).map((o) => roomy(chosen.get(o)!.spot.box)));
          const { spots, score, gx } = spotsFor(g);
          const best = spots.reduce((b, s) => (score(s) < score(b) ? s : b));
          if (best.box.x1 !== chosen.get(g)!.spot.box.x1 || best.box.y1 !== chosen.get(g)!.spot.box.y1) {
            if (score(best) < score(chosen.get(g)!.spot)) { chosen.set(g, { group: g, spot: best, gap: gx }); moved = true; }
          }
        }
        if (!moved) break;
      }
      // A name still read as another stop's may need a neighbour to step aside with it — on the phones, with
      // Shirakabeso placed, "Kyoto end" could only go below 8 once "Okayama start" moved beside 1, and neither moved
      // alone, so "Kyoto end" sat on 1's ring (fresh review, Oct 2). Two names at a time, on the final layout only.
      if (pairs) {
        type Spot2 = ReturnType<typeof spotsFor>["spots"][number];
        // (each name's places worked out once — a score reads `taken` as it stands when asked)
        const sf = new Map(byNeed.map((x) => [x, spotsFor(x)]));
        const othersBut = (a: Group, b: Group) => byNeed.filter((x) => x !== a && x !== b).map((x) => roomy(chosen.get(x)!.spot.box));
        const pairCost = (g: Group, sg: Spot2, o: Group, so: Spot2, others: Box[]) => {
          taken.length = 0; taken.push(...markerBoxes, ...others, roomy(so.box));
          const a = sf.get(g)!.score(sg);
          taken.length = 0; taken.push(...markerBoxes, ...others, roomy(sg.box));
          return a + sf.get(o)!.score(so);
        };
        for (const g of byNeed) {
          taken.length = 0; taken.push(...markerBoxes, ...byNeed.filter((x) => x !== g).map((x) => roomy(chosen.get(x)!.spot.box)));
          if (sf.get(g)!.score(chosen.get(g)!.spot) < 300) continue;
          let bestPair: { o: Group; sg: Spot2; so: Spot2; cost: number } | null = null;
          for (const o of byNeed) {
            if (o === g) continue;
            const others = othersBut(g, o);
            const now = pairCost(g, chosen.get(g)!.spot, o, chosen.get(o)!.spot, others);
            for (const sg of sf.get(g)!.spots) for (const so of sf.get(o)!.spots) {
              const c = pairCost(g, sg, o, so, others);
              if (c < now - 30 && (!bestPair || c - now < bestPair.cost)) bestPair = { o, sg, so, cost: c - now };
            }
          }
          if (bestPair) {
            chosen.set(g, { ...chosen.get(g)!, spot: bestPair.sg });
            chosen.set(bestPair.o, { ...chosen.get(bestPair.o)!, spot: bestPair.so });
          }
        }
      }
      let total = 0;
      const crowded: Box[] = [];
      for (const g of byNeed) {
        taken.length = 0;
        taken.push(...markerBoxes, ...byNeed.filter((o) => o !== g).map((o) => roomy(chosen.get(o)!.spot.box)));
        const s = spotsFor(g).score(chosen.get(g)!.spot);
        total += s;
        // (any touch: a line on an arrow, under a name or touching it — a line grazing the corner of "Karatsu · Hakata"
        // stayed under an earlier, higher bar and was never looked at again; fresh review, Oct 1)
        if (s >= 60) crowded.push(chosen.get(g)!.spot.box);
      }
      return { labels: groups.map((g) => chosen.get(g)!), total, crowded };
    };
    // The legs and the names together: when a name has no clear place, a leg passing it may take another of its arcs,
    // judged on the whole picture — the route's own rules and every name (on the phones the leg out of Hakata climbed
    // through the place beside "Karatsu · Hakata" and left from under it, so either place lay on the line — fresh
    // review, Oct 1)
    // (the route's rules are a limit, not a trade: an arc that crosses a marker, shares a marker's edge or runs along
    // another leg is never taken to help a name — weighed against the names, the legs ran over 1, 7 and 4)
    const ruleCost = routeCost(route.map((l) => l.pts));
    // (names first, the arrows free to move; then each arrow at the first place along its leg that's clear of every
    // name — the middle when it can — and the whole judged as drawn)
    const judge = (rt: typeof route, pairs = false) => {
      const names = nameAll(rt, true).labels.map((l) => l.spot.box);
      // (…and clear of every other leg: on a Pro Max the arrow into Tokyo sat where its leg crossed Nikko → Shirakabeso,
      // and read as a turn there — fresh review, Oct 2)
      const offLegs = (i: number, b: Box) => {
        const c = { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
        return rt.every((o, j) => j === i || o.pts.every((q, k) => {
          if (k === 0) return true;
          const p = o.pts[k - 1], dx = q.x - p.x, dy = q.y - p.y, len = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / len));
          return Math.hypot(c.x - (p.x + dx * t), c.y - (p.y + dy * t)) >= 16;
        }));
      };
      const clearOfNames = (leg: (typeof rt)[number], at: number, room = 0) => {
        const a = arrowBox(leg.pts, at), b = { x1: a.x1 + room, y1: a.y1 + room, x2: a.x2 - room, y2: a.y2 - room };
        return !names.some((n) => hit(n, b));
      };
      // (the room round an arrow given up before the crossing is: on the Pro Max every place on the leg into Tokyo lay
      // either within 2 pt of "Nagoya" or on the crossing — an arrow on a crossing reads as a turn, one a little near a
      // name doesn't)
      const fixed = rt.map((leg, i) => ({ ...leg, at: leg.at === null ? null
        : ARROW_AT.find((at) => clearOfNames(leg, at) && offLegs(i, arrowBox(leg.pts, at)))
          ?? ARROW_AT.find((at) => clearOfNames(leg, at, 2) && offLegs(i, arrowBox(leg.pts, at)))
          ?? ARROW_AT.find((at) => clearOfNames(leg, at)) ?? 0.5 }));
      const r = nameAll(fixed, false, pairs);
      // (and a little for each step away from the gentlest arc, more for leaving on a slant — weighed only against the
      // names, the legs took hooks and wide swings for the smallest gain; fresh review, Oct 1)
      const shape = rt.reduce((t, leg, i) => { const k = route[i].tries.indexOf(leg.pts); return t + (k % BOWS.length) * 6 + (k >= BOWS.length ? 40 : 0); }, 0);
      return { rt: fixed, ...r, cost: r.total + shape };
    };
    let best = judge(route);
    for (let pass = 0; pass < 3 && best.crowded.length; pass++) {
      let better = false;
      // (every leg, not only those passing the crowded names: a leg well clear of a name can still be what fills the
      // one place it has)
      for (let i = 0; i < route.length; i++) {
        for (const pts of route[i].tries) {
          if (pts === best.rt[i].pts) continue;
          const rt = best.rt.map((leg, j) => (j === i ? { ...leg, pts } : leg));
          if (routeCost(rt.map((l) => l.pts)) > ruleCost) continue;
          const r = judge(rt);
          if (r.cost < best.cost - 30) { best = r; better = true; }
        }
      }
      if (!better) break;
    }
    // (and once more, the legs settled and the names alone: a crowded name free to move a neighbour aside, a lone stop's
    // name over its "start" or "end", and a marker or name weighed above any line — see `pairs`)
    if (best.crowded.length) best = judge(best.rt, true);
    return { placed: best.labels, drawnRoute: best.rt };
  }, [groups, route, routeCost, view, nameWidth, stops, today]);

  // 3. The map fitted to what's drawn: as tall as the markers and names need (plus a margin), centered on them. A few
  // steps at most — each resize redraws, and the names may move.
  // Once it's settled it stays put, so a person's pinch or drag is theirs; "Whole trip" brings the fitted view back.
  const fits = useRef(0);
  const settled = useRef<{ zoom: number; cx: number; cy: number } | null>(null);
  const [moved, setMoved] = useState(false);
  useEffect(() => { fits.current = 0; settled.current = null; setMoved(false); }, [stops, again]);
  useEffect(() => {
    if (!map || !view || !placed.length) return;
    const cxNow = view.x0 + view.w / 2, cyNow = view.y0 + view.h / 2;
    if (settled.current) {
      const s = settled.current, k = 2 ** (view.zoom - s.zoom);
      setMoved(Math.abs(view.zoom - s.zoom) > 0.05 || Math.hypot(cxNow - s.cx * k, cyNow - s.cy * k) > 20);
      return;
    }
    if (fits.current >= 4) { settled.current = { zoom: view.zoom, cx: cxNow, cy: cyNow }; return; }
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
    if (Math.abs(want - view.h) <= 6 && !off) { settled.current = { zoom: view.zoom, cx: cxNow, cy: cyNow }; return; }
    fits.current++;
    onHeight(want);
    map.setCenter(place(cx, cy, view.zoom));
  }, [map, view, placed, drawnRoute, onHeight]);

  // During the trip: today's city dark, the ones already visited quieter; before it, the start ringed
  const tripStarted = stops.some((s) => s.firstDay && s.firstDay <= today);
  const stateOf = (s: Stop) =>
    s.firstDay && s.lastDay && s.firstDay <= today && today <= s.lastDay ? "here" as const
      : tripStarted && s.lastDay && s.lastDay < today ? "past" as const : "ahead" as const;
  // a leg is travelled once its stop has been reached
  const legs = useMemo(() => drawnRoute.map(({ pts, arrive, at }) => ({
    // (Google sets an arrow's tip at its place and draws its body behind it, so it's moved on by half its length, about
    // 4.5 pt, to sit centred where it was judged — on Tokyo → Nikko its base sat against Tokyo's marker; fresh review)
    at: at === null ? null : Math.min(1, at + 4.5 / Math.max(1, pts.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0))),
    path: pts.map((p) => place(p.x, p.y, view!.zoom)),
    done: !!arrive.firstDay && arrive.firstDay <= today,
    // (Google draws at the nearest whole zoom and stretches the picture: measured Oct 1 — iPhone SE 1.41×, iPhone 15
    // 0.73×, iPad 0.86×)
    k: 2 ** (view!.zoom - Math.round(view!.zoom)),
  })), [drawnRoute, view, today]);

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
                  ? `leading-[16px] py-px ${spot.h === "right" ? "text-right" : spot.h === "center" ? "text-center" : "text-left"}` : "leading-[18px]"}`}
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
