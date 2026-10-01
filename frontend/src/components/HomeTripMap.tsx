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
const TOUCH = 44;         // two markers closer than a fingertip become one
const SEGMENT = 20;       // one stop's part of a shared marker
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
type Leg = { path: google.maps.LatLngLiteral[]; done: boolean; k: number };

/** The way the trip goes: a gentle arc from marker to marker, one clear arrow in the middle of each; legs already
 *  travelled fade. (Straight lines ran through markers they didn't stop at, and a leg travelled back again laid its
 *  arrow on the other's — map review rounds 2–3.) */
function Route({ legs }: { legs: Leg[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const lines = legs.map((leg) => new google.maps.Polyline({
      path: leg.path, map, clickable: false, zIndex: 0,
      strokeColor: "#8a7a63", strokeOpacity: leg.done ? 0.3 : 0.75, strokeWeight: 2.5 / leg.k,
      icons: [
        // a pale edge, so the arrow reads against the line and the land
        { offset: "50%", icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 / leg.k, strokeColor: "#faf8f5", strokeWeight: 2 / leg.k, strokeOpacity: leg.done ? 0.4 : 1, fillOpacity: 0 } },
        { offset: "50%", icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.6 / leg.k, strokeColor: "#6f604c", strokeWeight: 1 / leg.k, strokeOpacity: leg.done ? 0.35 : 1, fillColor: "#6f604c", fillOpacity: leg.done ? 0.35 : 1 } },
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
  const { groups, route } = useMemo(() => {
    if (!view) return { groups: [] as Group[], route: [] as { pts: { x: number; y: number }[]; arrive: Stop }[] };
    const z = view.zoom;
    const groups: Group[] = [];
    for (const s of [...stops].sort((a, b) => a.visits[0] - b.visits[0])) {
      const p = pixel(s.city.latitude!, s.city.longitude!, z);
      const follows = (g: Group) => g.stops.some((o) => o.visits.some((v) => s.visits.some((w) => Math.abs(v - w) === 1)));
      const near = groups.find((g) => follows(g) && Math.hypot(p.x - g.x, p.y - g.y) < TOUCH);
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
    const drawn: { x: number; y: number }[][] = [];
    const usedEdges = new Map<Group, Set<"top" | "bottom">>();
    const route = hops.slice(1).map(({ g: bg, arrive, arriveV }, i) => {
      const ag = hops[i].g;
      const a0 = { x: halfX(ag, hops[i].departV), y: ag.y }, b0 = { x: halfX(bg, arriveV), y: bg.y };
      const dx = b0.x - a0.x, dy = b0.y - a0.y, len = Math.hypot(dx, dy) || 1;
      const nx = dy / len, ny = -dx / len, mx = (a0.x + b0.x) / 2, my = (a0.y + b0.y) / 2;
      const arc = (k: number) => {
        // (in proportion to the leg — a fixed cap left long iPad legs almost straight, and two legs out of one marker
        // ran together)
        const bow = Math.sign(k) * Math.min(180, Math.max(10, Math.abs(k) * len));
        const cx = mx + nx * bow, cy = my + ny * bow;
        // the ends on the edge the arc comes in from (its curve heads toward the control point)
        const a = edge(ag, a0.x, cy), b = edge(bg, b0.x, cy);
        return Array.from({ length: 25 }, (_, t) => { const u = t / 24; return { x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * cx + u ** 2 * b.x, y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * cy + u ** 2 * b.y }; });
      };
      const clearance = (pts: { x: number; y: number }[]) => Math.min(Infinity, ...groups.filter((o) => o !== ag && o !== bg).map((o) => Math.min(...pts.map((p) => Math.hypot(p.x - o.x, p.y - o.y))) - (o.stops.length * SEGMENT) / 2));
      // how much of this arc runs alongside a leg already drawn (on an iPad the leg into Karatsu and the leg out of
      // Hakata, both toward Okayama's side, ran together as one doubled line — map review round 7)
      // (measured to the drawn line itself, not its sample points — on a long iPad leg those are 40 px apart)
      const toSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
        const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
        return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
      };
      const alongside = (pts: { x: number; y: number }[]) => {
        let n = 0;
        for (let i = 1; i < pts.length; i++) for (let k = 1; k <= 4; k++) {
          const p = { x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 4, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / 4 };
          // (right by the markers it joins, legs are close by nature — that doesn't count)
          if (Math.hypot(p.x - ag.x, p.y - ag.y) < 30 || Math.hypot(p.x - bg.x, p.y - bg.y) < 30) continue;
          if (drawn.some((leg) => leg.some((q, j) => j > 0 && toSeg(p, leg[j - 1], q) < 8))) n++;
        }
        return n;
      };
      // A shared marker's legs use different edges (one in at the top, one out at the bottom) wherever an arc allows —
      // on an iPad both legs met "2 | 3" at the top and you couldn't tell which city each belonged to (round 8)
      const edgeAt = (g: Group, p: { y: number }) => (p.y < g.y ? "top" : "bottom");
      const sameEdge = (p: { x: number; y: number }[]) =>
        (shared(ag) && usedEdges.get(ag)?.has(edgeAt(ag, p[0])) ? 1 : 0) + (shared(bg) && usedEdges.get(bg)?.has(edgeAt(bg, p[p.length - 1])) ? 1 : 0);
      const tries = [0.14, -0.14, 0.28, -0.28, 0.42, -0.42].map(arc);
      const score = (p: { x: number; y: number }[], i: number) => (clearance(p) >= 8 ? 0 : 1000) + alongside(p) * 20 + sameEdge(p) * 300 + i;
      const pts = tries.reduce((best, p, i) => (score(p, i) < score(best, tries.indexOf(best)) ? p : best));
      drawn.push(pts);
      for (const [g, p] of [[ag, pts[0]], [bg, pts[pts.length - 1]]] as const) {
        if (!usedEdges.has(g)) usedEdges.set(g, new Set());
        usedEdges.get(g)!.add(edgeAt(g, p));
      }
      return { pts, arrive };
    });
    return { groups, route };
  }, [stops, order, view]);

  // "start" and "end" beside the first and last stop's names (a ring marked the start; the end had to be worked out)
  const lastVisit = Math.max(0, ...stops.flatMap((s) => s.visits));
  const tagOf = useCallback((s: Stop) => (s.visits.includes(1) ? "start" : s.visits.includes(lastVisit) ? "end" : ""), [lastVisit]);
  const nameWidth = useCallback((g: Group) => {
    const text = g.stops.map((s) => `${s.city.name}${tagOf(s) ? ` ${tagOf(s)}` : ""}`).join(" · ");
    return text.length * 6.4 + 14;
  }, [tagOf]);

  // 2. Each name on a free side
  const placed = useMemo(() => {
    if (!view) return [];
    type Box = { x1: number; y1: number; x2: number; y2: number };
    const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    // (inside the map, and clear of Google's logo and credit along its foot, which must show)
    const inside = (b: Box) => b.x1 >= view.x0 + 4 && b.x2 <= view.x0 + view.w - 4 && b.y1 >= view.y0 + 4 && b.y2 <= view.y0 + view.h - GOOGLE_STRIP;
    const half = (g: Group) => (g.stops.reduce((t, s) => t + s.visits.length, 0) * SEGMENT + 3) / 2;
    const taken: Box[] = groups.map((g) => ({ x1: g.x - half(g) - 2, y1: g.y - MARKER / 2 - 2, x2: g.x + half(g) + 2, y2: g.y + MARKER / 2 + 2 }));
    // the route as points every few px, to keep names off it
    const line: { x: number; y: number }[] = [];
    for (const { pts } of route) for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let k = 0; k <= n; k++) line.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    // (with 4 px of room around a name — a line 1 pt from a name read as resting on it; round 9)
    const lineIn = (b: Box) => line.filter((p) => p.x > b.x1 - 4 && p.x < b.x2 + 4 && p.y > b.y1 - 4 && p.y < b.y2 + 4).length;
    // each leg's arrow sits halfway along it
    const arrows: Box[] = route.map(({ pts }) => { const m = pts[Math.floor(pts.length / 2)]; return { x1: m.x - 9, y1: m.y - 9, x2: m.x + 9, y2: m.y + 9 }; });
    // Twelve places a name can go; each scored — outside the map or on a marker or name: never if avoidable; on an
    // arrow: hardly ever; on the line: as little as can be (names sat on the line and hid arrows — map review round 4)
    const spotsFor = (g: Group) => {
      const w = nameWidth(g), h = 18, gx = half(g) + 3, gy = MARKER / 2 + 3;
      type Spot = { box: Box; h: "left" | "right" | "center"; hd: number; v: "top" | "bottom" | "middle"; vd: number };
      const spots: Spot[] = [
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
      ];
      // …and tight to its own marker: never nearer another marker than its own ("Kyoto end" sat between 7 and 1 and
      // could be read as either — round 5); a side spot over a corner one when they're otherwise equal
      // (measured from the name's nearest edge — from its middle, a long name touching its own marker could count as
      // "nearer" another, and "Kyoto end" was pushed onto a line; map review round 8)
      const toBox = (b: Box, x: number, y: number) => Math.hypot(Math.max(b.x1 - x, 0, x - b.x2), Math.max(b.y1 - y, 0, y - b.y2));
      const nearer = (s: Spot) => groups.some((o) => o !== g && toBox(s.box, o.x, o.y) < toBox(s.box, g.x, g.y));
      const score = (s: Spot) => (inside(s.box) ? 0 : 10000) + taken.filter((t) => hit(s.box, t)).length * 1000
        // (a name on a line hides where the trip goes — weighed almost as heavily as an arrow; round 6: a leg ran under
        // "Kyoto end" and the trip seemed to pass through Kyoto)
        + (nearer(s) ? 300 : 0) + arrows.filter((a) => hit(s.box, a)).length * 200 + lineIn(s.box) * 60
        + (s.hd < 0 ? 120 : s.vd < 0 ? 2 : 0);
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
      taken.push(best.box);
      chosen.set(g, { group: g, spot: best, gap: gx });
    }
    // Then each name is tried again with the others where they are, until none moves (a name placed early can step
    // aside for one that has nowhere else to go)
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const g of byNeed) {
        taken.length = 0;
        taken.push(...markerBoxes, ...byNeed.filter((o) => o !== g).map((o) => chosen.get(o)!.spot.box));
        const { spots, score, gx } = spotsFor(g);
        const best = spots.reduce((b, s) => (score(s) < score(b) ? s : b));
        if (best.box.x1 !== chosen.get(g)!.spot.box.x1 || best.box.y1 !== chosen.get(g)!.spot.box.y1) {
          if (score(best) < score(chosen.get(g)!.spot)) { chosen.set(g, { group: g, spot: best, gap: gx }); moved = true; }
        }
      }
      if (!moved) break;
    }
    return groups.map((g) => chosen.get(g)!);
  }, [groups, route, view, nameWidth]);

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
    const boxes = [...placed.map((p) => p.spot.box), ...placed.map(({ group: g }) => ({ x1: g.x - 14, y1: g.y - 14, x2: g.x + 14, y2: g.y + 14 }))];
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
  }, [map, view, placed, onHeight]);

  // During the trip: today's city dark, the ones already visited quieter; before it, the start ringed
  const tripStarted = stops.some((s) => s.firstDay && s.firstDay <= today);
  const stateOf = (s: Stop) =>
    s.firstDay && s.lastDay && s.firstDay <= today && today <= s.lastDay ? "here" as const
      : tripStarted && s.lastDay && s.lastDay < today ? "past" as const : "ahead" as const;
  // a leg is travelled once its stop has been reached
  const legs = useMemo(() => route.map(({ pts, arrive }) => ({
    path: pts.map((p) => place(p.x, p.y, view!.zoom)),
    done: !!arrive.firstDay && arrive.firstDay <= today,
    // (Google draws at the nearest whole zoom and stretches the picture: measured Oct 1 — iPhone SE 1.41×, iPhone 15
    // 0.73×, iPad 0.86×)
    k: 2 ** (view!.zoom - Math.round(view!.zoom)),
  })), [route, view, today]);

  return (
    <>
      <Route legs={legs} />
      {moved && map && createPortal(
        <button type="button" onClick={onWholeTrip}
          className="absolute top-2 right-2 z-10 min-h-[44px] px-3 rounded-full bg-white/95 border border-[#e0d8cc] shadow text-sm text-[#514636]">
          Whole trip
        </button>,
        map.getDiv(),
      )}
      {placed.map(({ group, spot, gap }) => {
        const anyHere = group.stops.some((s) => stateOf(s) === "here");
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
              style={{ width: Math.max(TOUCH, gap * 2), height: TOUCH, transform: "translate(-50%, -50%)" }}>
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
                className="absolute whitespace-nowrap rounded px-1.5 text-[11px] leading-[18px] bg-[#faf8f5]/90 shadow-[0_0_0_0.5px_rgba(58,49,40,0.15)]"
                style={{
                  ...(spot.h === "left" ? { left: `calc(50% + ${spot.hd}px)` } : spot.h === "right" ? { right: `calc(50% + ${spot.hd}px)` } : { left: "50%" }),
                  ...(spot.v === "top" ? { top: `calc(50% + ${spot.vd}px)` } : spot.v === "bottom" ? { bottom: `calc(50% + ${spot.vd}px)` } : { top: "50%" }),
                  transform: `${spot.h === "center" ? "translateX(-50%)" : ""} ${spot.v === "middle" ? "translateY(-50%)" : ""}`.trim() || undefined,
                }}>
                {group.stops.map((s, i) => {
                  const st = stateOf(s);
                  const end = tagOf(s);
                  return (
                    <span key={s.city.id}>{i > 0 && <span className="text-[#8a7d6a]"> · </span>}
                      {/* today's city: a dark chip, so "where are we now" doesn't rest on half a marker (round 4) */}
                      <span className={st === "here" ? "font-semibold text-white bg-[#514636] rounded px-1 -mx-0.5"
                        // (only places already visited go quiet — "Nikko", still ahead, looked visited; round 7)
                        : st === "past" ? "text-[#8a7d6a]" : "font-medium text-[#3a3128]"}>{s.city.name}</span>
                      {/* (the secondary text color — lighter, "start"/"end" were hard for older eyes; round 8) */}
                      {end && <span className="text-[#6b5d4a]"> {end}</span>}
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
      onAdd() { this.getPanes()!.overlayMouseTarget.appendChild(el); google.maps.OverlayView.preventMapHitsAndGesturesFrom(el); }
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
