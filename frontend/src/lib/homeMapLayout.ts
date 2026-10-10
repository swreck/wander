/**
 * The Home map's layout — where each marker, leg and name goes — worked out from the stops, the view and the names'
 * measured widths. Moved here unchanged from HomeTripMap (Oct 10) so it can run in a worker (homeMapLayout.worker.ts):
 * worked out on the page, it froze Home up to 1 s at a time on an app open (Oct 10 re-audit). The design notes for each
 * rule are beside it, as they were.
 */
import type { City } from "./types";

export const MARKER = 22;        // a marker's size, in points
export const TOUCH = 44;         // two markers closer than a fingertip are nudged apart
// Stops one after the other share a marker when theirs would overlap (or the trip doubles back through them, below); a
// fingertip apart otherwise they're nudged instead
// (merged at 44, Tokyo and Nikko — 41 pt apart on an iPhone 15 — made "5 | 6", and the leg back to Kyoto had to cross
// the only place for its name; 45 pt apart on a Pro Max they were two markers and clean; fresh review, Oct 1)
export const MERGE = 30;
export const SEGMENT = 20;       // one stop's part of a shared marker
export const ARROW_AT = [0.5, 0.42, 0.58, 0.35, 0.65]; // where along a leg its arrow may sit, the middle first
export const BOWS = [0.14, -0.14, 0.28, -0.28, 0.42, -0.42, 0.56, -0.56]; // how deep a leg may arc, the gentlest first
export const STUB = 20;        // how strongly a leg leaving a shared marker heads straight up or down before it bends away
export const GOOGLE_STRIP = 28;  // Google's logo and data credit along the map's foot — never covered

export type Stop = { city: City; visits: number[]; firstDay: string | null; lastDay: string | null };
/** One marker: one stop, or stops that come one after the other and sit closer than a fingertip. `x`/`y`: where it's
 *  drawn, in pixels at the current zoom (nudged off a non-consecutive neighbour); `lat`/`lng`: the same point. */
export type Group = { stops: Stop[]; x: number; y: number; lat: number; lng: number };

/** Where a point sits, in pixels, at a zoom (Web Mercator — what Google draws) */
export function pixel(lat: number, lng: number, zoom: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

/** …and back: the place at a pixel */
export function place(x: number, y: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI, lng: (x / scale) * 360 - 180 };
}

/** What a layout is worked out for: the map's zoom and where its edges are, in pixels */
export type View = { zoom: number; x0: number; y0: number; w: number; h: number };
/** Each stop's name measured on the page in Wander's type (a worker can't measure): medium, today's semibold, its
 *  " start"/" end" after it and alone; and the " · " between names */
export type NameWidths = { dot: number; byCity: Record<string, { w500: number; w600: number; tag: number; tagAlone: number }> };
export type LayoutInput = { stops: Stop[]; order: string[]; view: View; today: string; innerHeight: number; widths: NameWidths;
  /** no city is "today's stop" for this person (still at home on this Japan date) — names drawn as the rest */
  noHere?: boolean };
export type Box = { x1: number; y1: number; x2: number; y2: number };
export type Spot = { box: Box; h: "left" | "right" | "center"; hd: number; v: "top" | "bottom" | "middle"; vd: number; stacked: boolean };
/** The drawing: each marker with its name's place, and each leg as drawn (its points, the stop it arrives at, its arrow) */
export type Layout = { placed: { group: Group; spot: Spot; gap: number }[]; drawnRoute: { pts: { x: number; y: number }[]; arrive: Stop; at: number | null }[] };

/** "start" and "end" beside the first and last stop's names */
export function tagFor(stops: Stop[]) {
  const lastVisit = Math.max(0, ...stops.flatMap((s) => s.visits));
  return (s: Stop) => (s.visits.includes(1) ? "start" : s.visits.includes(lastVisit) ? "end" : "");
}
/** Today's stop (its name is drawn semibold, in a chip) */
export const isHere = (s: Stop, today: string) => !!s.firstDay && !!s.lastDay && s.firstDay <= today && today <= s.lastDay;

export function layoutMap({ stops, order, view, today, innerHeight, widths, noHere = false }: LayoutInput): Layout {
  const tagOf = tagFor(stops);
  // A name's width (as drawn: names medium, today's semibold in a chip, " · " and "start"/"end" regular; 6 px each side)
  const nameWidth = (g: Group) => {
    const each = g.stops.map((s) => {
      const w = widths.byCity[s.city.id], here = !noHere && isHere(s, today);
      return (here ? w.w600 : w.w500) + (here ? 4 : 0) + (tagOf(s) ? w.tag : 0);
    });
    // `one`: on one line, "Tokyo · Nikko"; `stacked`: a shared marker's names one above the other — or a lone stop's
    // name over its "start" or "end"
    const lone = g.stops.length === 1 && tagOf(g.stops[0]) ? [widths.byCity[g.stops[0].city.id].w500, widths.byCity[g.stops[0].city.id].tagAlone] : null;
    return { one: each.reduce((t, w) => t + w, 0) + (each.length - 1) * widths.dot + 12 + 2, stacked: Math.max(...(lone ?? each)) + 12 + 2 };
  };

  function groupsAndRoute(skip = false) {
    if (!view || skip) return { groups: [] as Group[], route: [] as { pts: { x: number; y: number }[]; arrive: Stop; tries: { x: number; y: number }[][]; at: number | null }[], routeCost: () => 0 };
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
      // (and each with a long straight lead into or out of a shared marker's own half, in proportion to the leg: on an
      // iPhone 17 Pro the leg from Okayama came in flat along the bottom of "2 | 3", under Hakata's half, and the trip
      // seemed to go from Okayama into Hakata — fresh review, Oct 3. A J-curve, not an elbow.)
      const deep = Math.max(STUB * 1.4, len * 0.22);
      return { ag, bg, arrive, tries: [...bows.map((k) => arc(k, 0)), ...bows.map((k) => arc(k, STUB * 1.4, true)), ...bows.map((k) => arc(k, deep))] };
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
    const room = Math.max(0, Math.round(innerHeight * 0.4) - view.h) / 2;
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
  }
  const { groups, route, routeCost } = groupsAndRoute();

  function namesPlaced() {
    if (!view) return { placed: [], drawnRoute: route };
    type Box = { x1: number; y1: number; x2: number; y2: number };
    const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    // (inside the map, and clear of Google's logo and credit along its foot, which must show)
    // (above or below counts as inside while the map can still grow to take it in — the fit below makes it as tall as its
    // names; on production's iPhone 15 the map sat at its 200 px least, the place under "Karatsu · Hakata" was in
    // Google's strip, and the name went onto the leg out of Hakata instead)
    const grow = Math.max(0, Math.round(innerHeight * 0.4) - view.h) / 2;
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
    // A name with a leg running under it: that leg and a neighbour may take other arcs together (on Ken's iPhone 17 Pro
    // the leg into Nagoya ran under "Okayama start" and the trip seemed to go back to Okayama — fresh review, Oct 3; the
    // cure: the leg to Karatsu and the one to Nagoya bowing on opposite sides, as a Pro Max draws them). No new crossing.
    // Screened with the quick naming; the careful naming runs on the best few; none clear: the layout above stands.
    if (best.crowded.length) {
      const start = best;
      // (any point inside a name's box)
      const under = (b: Box) => (pts: { x: number; y: number }[]) => pts.some((p) => p.x > b.x1 && p.x < b.x2 && p.y > b.y1 && p.y < b.y2);
      const nameOnLine = (r: typeof best) => r.labels.some((l) => r.rt.some((leg) => under(l.spot.box)(leg.pts)));
      const legsUnder = new Set<number>();
      for (const l of start.labels) start.rt.forEach((leg, i) => { if (under(l.spot.box)(leg.pts)) legsUnder.add(i); });
      const found: (typeof best)[] = [];
      for (const i of legsUnder) for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= route.length) continue;
        // (every shape for the leg under the name, the gentle bows for its neighbour)
        for (const pi of route[i].tries) for (const pj of route[j].tries.slice(0, BOWS.length)) {
          const rt = start.rt.map((leg, k) => (k === i ? { ...leg, pts: pi } : k === j ? { ...leg, pts: pj } : leg));
          if (routeCost(rt.map((l) => l.pts)) > ruleCost) continue;
          const r = judge(rt);
          if (!nameOnLine(r)) found.push(r);
        }
      }
      found.sort((x, y) => x.cost - y.cost);
      for (const f of found.slice(0, 8)) {
        const careful = judge(f.rt, true);
        if (!nameOnLine(careful)) { best = careful; break; }
      }
    }
    return { placed: best.labels, drawnRoute: best.rt };
  }
  const r = namesPlaced();
  // (without the arcs it chose among — only the drawn ones are needed)
  return { placed: r.placed, drawnRoute: r.drawnRoute.map(({ pts, arrive, at }) => ({ pts, arrive, at })) };
}
