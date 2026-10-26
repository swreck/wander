/**
 * Fit a paper's photo before it's kept, or after (Ken, Oct 26: "I thought keep a paper was supposed to have crop… It
 * should, and ideally would have full editing tools to change parallax and contrast"; he said yes to: four corners to
 * drag onto the paper's corners — that crops it and straightens a sheet shot at an angle — and "Crisper" for faint print
 * or dim light). Full screen inside Wander; the result is a JPEG made on the phone (longest side 2000 px, as kept papers
 * are) and a small copy for the lists. Used by Papers.tsx: right after a photo is chosen, and from a kept paper's "Edit".
 * (Fresh check, Oct 26: the page came out ~30% too wide, each Save trimmed 4% off every edge, crossed corners kept a
 * smear, Crisper turned paper tan, the magnifier barely magnified and hid under the hand, a grabbed circle jumped, and
 * there was no Turn — each fixed below.)
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useBackToClose from "../hooks/useBackToClose";

type P = { x: number; y: number };
export type Edited = { data: string; thumb: string };

const WORK = 2400;  // (the photo is worked on at most this size — a 12-megapixel photo whole is too much for a phone's memory)
const OUT = 2000;   // (and kept at most this size, like every kept paper)
const LOUPE = 110, ZOOM = 2.5;

/** The perspective that maps one four-point shape onto another (a homography: 8 numbers, the 9th is 1) */
function homography(src: P[], dst: P[]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(8).fill(0);
  for (let r = 7; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k]; h[r] = s / A[r][r]; }
  return [...h, 1];
}
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** The four corners in order — top-left, top-right, bottom-right, bottom-left — however they were dragged (two crossed
 *  kept a smear; two swapped kept mirror-image print) */
export function ordered(cs: P[]): P[] {
  const cx = cs.reduce((s, p) => s + p.x, 0) / 4, cy = cs.reduce((s, p) => s + p.y, 0) / 4;
  const around = [...cs].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const first = around.reduce((best, p, i) => (p.x + p.y < around[best].x + around[best].y ? i : best), 0);
  return [...around.slice(first), ...around.slice(0, first)];
}

/** The paper's true width ÷ height, worked out from where its corners fall in the photo (Zhang & He's whiteboard method:
 *  the camera's focal length is estimated from the shape, then the page is un-tilted); a flat-on photo, or a shape it
 *  can't settle, uses the average of opposite edges */
export function trueRatio(cs: P[], w: number, h: number): number {
  const [tl, tr, br, bl] = cs;
  const m1 = [tl.x, tl.y, 1], m2 = [tr.x, tr.y, 1], m3 = [bl.x, bl.y, 1], m4 = [br.x, br.y, 1];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const edges = (dist(tl, tr) + dist(bl, br)) / (dist(tl, bl) + dist(tr, br));
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3), k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  const n2 = m2.map((v, i) => k2 * v - m1[i]), n3 = m3.map((v, i) => k3 * v - m1[i]);
  const u0 = w / 2, v0 = h / 2;
  const denom = n2[2] * n3[2];
  // (a phone's main camera: a focal length about ¾ of the photo's long side — used when the shape can't tell it: a sheet
  // tilted straight back, its top and bottom edges parallel in the photo, came out 6% too wide with edges averaged)
  const phone = 0.75 * Math.max(w, h);
  let f = phone;
  if (Math.abs(denom) > 1e-12) {
    const f2 = -((n2[0] * n3[0] - (n2[0] * n3[2] + n2[2] * n3[0]) * u0 + n2[2] * n3[2] * u0 * u0)
      + (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + n2[2] * n3[2] * v0 * v0)) / denom;
    if (f2 > 0 && Math.sqrt(f2) > 0.3 * Math.max(w, h) && Math.sqrt(f2) < 5 * Math.max(w, h)) f = Math.sqrt(f2);
  }
  const len = (n: number[]) => Math.hypot((n[0] - u0 * n[2]) / f, (n[1] - v0 * n[2]) / f, n[2]);
  const r = len(n2) / len(n3);
  return isFinite(r) && r > 0.2 && r < 5 ? r : edges;
}

function warp(src: ImageData, corners: P[], max = OUT): ImageData {
  const cs = ordered(corners);
  const [tl, tr, br, bl] = cs;
  const ratio = trueRatio(cs, src.width, src.height);
  // (its size: the longer of its two heights, and the true width for that height — then no larger than max)
  let h = Math.max(dist(tl, bl), dist(tr, br)), w = h * ratio;
  const k = Math.min(1, max / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  // (a hair inside the corners — on the paper's very edge a sliver of the table blended into the outer pixels)
  const cx = cs.reduce((s, p) => s + p.x, 0) / 4, cy = cs.reduce((s, p) => s + p.y, 0) / 4;
  const inside = cs.map((p) => { const d = Math.hypot(p.x - cx, p.y - cy) || 1, k2 = Math.min(1, 2.5 / d); return { x: p.x + (cx - p.x) * k2, y: p.y + (cy - p.y) * k2 }; });
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], inside);
  const out = new ImageData(w, h);
  const S = src.data, D = out.data, sw = src.width, sh = src.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = H[6] * x + H[7] * y + 1;
      const fx = (H[0] * x + H[1] * y + H[2]) / d, fy = (H[3] * x + H[4] * y + H[5]) / d;
      const x0 = Math.max(0, Math.min(sw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(sh - 2, Math.floor(fy)));
      const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = S[i00 + c] * (1 - ax) + S[i10 + c] * ax, bot = S[i01 + c] * (1 - ax) + S[i11 + c] * ax;
        D[o + c] = top * (1 - ay) + bot * ay;
      }
      D[o + 3] = 255;
    }
  }
  return out;
}

/** "Crisper", measured on the page itself: each colour stretched from the ink (its 2nd percentile) to the paper (its
 *  90th) — so the paper comes out white, not tinted (one curve for all three colours turned a beige sheet tan) */
export function crisperMaps(page: ImageData): Uint8ClampedArray[] {
  const d = page.data, n = d.length / 4;
  return [0, 1, 2].map((c) => {
    const hist = new Uint32Array(256);
    for (let i = c; i < d.length; i += 4) hist[d[i]]++;
    const at = (q: number) => { let s = 0; for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= n * q) return v; } return 255; };
    const lo = at(0.02), hi = Math.max(lo + 40, at(0.9));
    const map = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) map[v] = Math.round(((v - lo) / (hi - lo)) * 255);
    return map;
  });
}
export function applyMaps(img: ImageData, maps: Uint8ClampedArray[]): ImageData {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = maps[0][d[i]]; d[i + 1] = maps[1][d[i + 1]]; d[i + 2] = maps[2][d[i + 2]]; }
  return out;
}

function toJpeg(img: ImageData, max: number, q: number): string {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  if (Math.max(img.width, img.height) <= max) return c.toDataURL("image/jpeg", q);
  const k = max / Math.max(img.width, img.height), s = document.createElement("canvas");
  s.width = Math.max(1, Math.round(img.width * k)); s.height = Math.max(1, Math.round(img.height * k));
  const g = s.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(c, 0, 0, s.width, s.height);
  return s.toDataURL("image/jpeg", q);
}

type Work = { canvas: HTMLCanvasElement; data: ImageData; small: ImageData; smallK: number };
function workOf(c: HTMLCanvasElement): Work {
  const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
  // (a small copy, for Crisper's preview measured on the page alone)
  const smallK = Math.min(1, 500 / Math.max(c.width, c.height)), s = document.createElement("canvas");
  s.width = Math.max(1, Math.round(c.width * smallK)); s.height = Math.max(1, Math.round(c.height * smallK));
  s.getContext("2d")!.drawImage(c, 0, 0, s.width, s.height);
  return { canvas: c, data, small: s.getContext("2d")!.getImageData(0, 0, s.width, s.height), smallK };
}
const wholePhoto = (c: HTMLCanvasElement): P[] => [{ x: 0, y: 0 }, { x: c.width, y: 0 }, { x: c.width, y: c.height }, { x: 0, y: c.height }];

export default function PaperEdit({ src, mode, onKeep, onAsIs, onCancel, onOriginal }: {
  /** the photo: a chosen file's object address, or a kept paper's link */
  src: string;
  /** "new": before keeping (Keep it / Keep the photo as it is); "kept": a kept paper (Save; Back to the original once edited) */
  mode: "new" | "kept";
  onKeep: (e: Edited) => void | Promise<void>;
  onAsIs?: () => void;
  onCancel: () => void;
  onOriginal?: () => void | Promise<void>;
}) {
  useBackToClose(true, onCancel);
  const [work, setWork] = useState<Work | null>(null);
  const [failed, setFailed] = useState(false);
  const [corners, setCorners] = useState<P[] | null>(null);   // in the work image's pixels, as dragged
  const [crisp, setCrisp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [touch, setTouch] = useState<P | null>(null);
  const grab = useRef<P>({ x: 0, y: 0 });
  const area = useRef<HTMLDivElement>(null);
  const shown = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState<{ k: number; ox: number; oy: number; w: number; h: number } | null>(null);

  // The photo, at working size; the corners start at its own corners (Keep it untouched loses nothing — starting 4%
  // inside trimmed every Save of an already fitted paper)
  useEffect(() => {
    let gone = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (gone) return;
      const k = Math.min(1, WORK / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      try { setWork(workOf(c)); setCorners(wholePhoto(c)); } catch { setFailed(true); }
    };
    img.onerror = () => { if (!gone) setFailed(true); };
    img.src = src;
    return () => { gone = true; };
  }, [src]);

  // Turn: the photo a quarter turn clockwise, the corners with it
  const turn = () => {
    if (!work || !corners) return;
    const old = work.canvas, c = document.createElement("canvas");
    c.width = old.height; c.height = old.width;
    const g = c.getContext("2d")!;
    g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(old, 0, 0);
    setCorners(corners.map((p) => ({ x: old.height - p.y, y: p.x })));
    setWork(workOf(c));
  };

  // How it sits on the screen, and the screen copy — with Crisper as it will be kept, measured on the page alone
  useEffect(() => {
    if (!work || !area.current || !shown.current) return;
    const place = () => {
      const r = area.current!.getBoundingClientRect(), pad = 14;
      const k = Math.min((r.width - pad * 2) / work.canvas.width, (r.height - pad * 2) / work.canvas.height);
      const w = Math.round(work.canvas.width * k), h = Math.round(work.canvas.height * k);
      setFit({ k, ox: Math.round((r.width - w) / 2), oy: Math.round((r.height - h) / 2), w, h });
      const c = shown.current!, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(work.canvas, 0, 0, c.width, c.height);
      if (crisp && corners) {
        const maps = crisperMaps(warp(work.small, corners.map((p) => ({ x: p.x * work.smallK, y: p.y * work.smallK })), 400));
        g.putImageData(applyMaps(g.getImageData(0, 0, c.width, c.height), maps), 0, 0);
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
    // (corners: only once a drag ends, so the preview isn't redrawn at every finger move)
  }, [work, crisp, dragging === null ? corners : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // The magnifier while a corner is dragged: the photo around that corner, 2.5× its size on screen
  useEffect(() => {
    if (dragging === null || !corners || !work || !loupe.current || !fit) return;
    const c = loupe.current, g = c.getContext("2d")!, s = c.width, p = corners[dragging], span = LOUPE / ZOOM / 2 / fit.k;
    g.fillStyle = "#000"; g.fillRect(0, 0, s, s);
    g.drawImage(work.canvas, p.x - span, p.y - span, span * 2, span * 2, 0, 0, s, s);
    g.strokeStyle = "#7ec8ff"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s / 2 - 16, s / 2); g.lineTo(s / 2 + 16, s / 2); g.moveTo(s / 2, s / 2 - 16); g.lineTo(s / 2, s / 2 + 16); g.stroke();
  }, [dragging, corners, work, fit]);

  const toScreen = (p: P) => (fit ? { x: fit.ox + p.x * fit.k, y: fit.oy + p.y * fit.k } : { x: 0, y: 0 });
  const move = (i: number, clientX: number, clientY: number) => {
    if (!fit || !work || !area.current) return;
    const r = area.current.getBoundingClientRect();
    // (the corner keeps its distance from where the finger took hold — it used to jump to the fingertip)
    const sx = clientX - r.left - grab.current.x, sy = clientY - r.top - grab.current.y;
    const x = Math.max(0, Math.min(work.canvas.width, (sx - fit.ox) / fit.k));
    const y = Math.max(0, Math.min(work.canvas.height, (sy - fit.oy) / fit.k));
    setCorners((cs) => cs && cs.map((c, j) => (j === i ? { x, y } : c)));
    setTouch({ x: clientX - r.left, y: clientY - r.top });
  };

  const keep = async () => {
    if (!work || !corners) return;
    setBusy("Getting it ready…");
    await new Promise((ok) => setTimeout(ok, 30));   // (a frame for the words, before the phone is busy for a moment)
    try {
      let page = warp(work.data, corners);
      if (crisp) page = applyMaps(page, crisperMaps(page));
      await onKeep({ data: toJpeg(page, OUT, 0.85).split(",")[1], thumb: toJpeg(page, 240, 0.7) });
    } catch {
      setBusy(null);
      setFailed(true);
    }
  };

  const poly = corners && fit ? ordered(corners).map(toScreen) : null;
  const handles = corners && fit ? corners.map(toScreen) : null;
  const areaW = area.current?.clientWidth || 400;
  // (the magnifier beside the finger, on the side away from the hand — above or below it was under the thumb)
  const loupeAt = touch ? {
    left: Math.min(Math.max(touch.x > areaW / 2 ? touch.x - LOUPE - 44 : touch.x + 44, 8), areaW - LOUPE - 8),
    top: Math.max(8, touch.y - LOUPE - 12),
  } : null;
  const title = mode === "new" ? "Fit it before keeping" : "Edit the photo";
  const btn = "min-h-[44px] px-4 rounded-xl text-[15px] whitespace-nowrap disabled:opacity-50";
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black flex flex-col text-white" role="dialog" aria-modal="true" aria-label={title} data-paper-edit>
      <div className="flex items-center justify-between gap-2 px-3" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}>
        <button onClick={onCancel} disabled={!!busy} className="min-h-[44px] min-w-[64px] text-left text-[15px] disabled:opacity-50">Cancel</button>
        <p className="text-[15px] font-medium truncate">{title}</p>
        <span className="min-w-[64px]" />
      </div>
      <p className="px-4 text-center text-[13px] text-white/75">Drag each circle to a corner of the paper. That crops it and straightens it.</p>
      <div ref={area} className="relative flex-1 overflow-hidden select-none" style={{ touchAction: "none" }}>
        {failed ? <p role="status" className="absolute inset-0 flex items-center justify-center px-8 text-center text-[16px] text-white/85">This photo couldn't be opened here.{mode === "new" ? " Choose it again, or take a new one." : ""}</p> : (
          <>
            <canvas ref={shown} aria-label="The photo" className="absolute" style={fit ? { left: fit.ox, top: fit.oy, width: fit.w, height: fit.h } : { visibility: "hidden" }} />
            {poly && fit && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
                {/* (outside the paper dimmed — it's cut away; the paper's edges drawn) */}
                <path fillRule="evenodd" fill="rgba(0,0,0,0.6)"
                  d={`M${fit.ox},${fit.oy}h${fit.w}v${fit.h}h${-fit.w}Z M${poly.map((p) => `${p.x},${p.y}`).join(" L")}Z`} />
                <polygon points={poly.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#7ec8ff" strokeWidth={2} />
              </svg>
            )}
            {handles && handles.map((p, i) => (
              <button key={i} aria-label={["Top-left corner", "Top-right corner", "Bottom-right corner", "Bottom-left corner"][i]} data-corner={i}
                className="absolute w-14 h-14 -ml-7 -mt-7 rounded-full flex items-center justify-center"
                style={{ left: p.x, top: p.y, touchAction: "none" }}
                onPointerDown={(e) => {
                  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                  const r = area.current!.getBoundingClientRect();
                  grab.current = { x: e.clientX - r.left - p.x, y: e.clientY - r.top - p.y };
                  setDragging(i); setTouch({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onPointerMove={(e) => { if (dragging === i) move(i, e.clientX, e.clientY); }}
                onPointerUp={() => { setDragging(null); setTouch(null); }}
                onPointerCancel={() => { setDragging(null); setTouch(null); }}>
                {/* (a ring with a dot, so the corner itself stays in sight) */}
                <span className="relative block w-7 h-7 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]">
                  <span className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-[#7ec8ff]" />
                </span>
              </button>
            ))}
            {dragging !== null && loupeAt && (
              <canvas ref={loupe} width={LOUPE * 2} height={LOUPE * 2} aria-hidden data-loupe className="absolute rounded-full border-2 border-white shadow-xl pointer-events-none"
                style={{ width: LOUPE, height: LOUPE, ...loupeAt }} />
            )}
          </>
        )}
        {busy && <p role="status" className="absolute inset-x-0 bottom-3 text-center text-[15px]">{busy}</p>}
      </div>
      <div className="px-4 pt-2 flex flex-col gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setCrisp((c) => !c)} disabled={!work || !!busy} aria-pressed={crisp}
            className={`${btn} ${crisp ? "bg-white text-[#1d1813]" : "bg-white/10 text-white"}`}>Crisper</button>
          <button onClick={turn} disabled={!work || !!busy} aria-label="Turn the photo a quarter turn" className={`${btn} bg-white/10 text-white`}>Turn ↻</button>
          <span className="text-[13px] text-white/65 leading-tight">{crisp ? "Whiter paper, darker print" : "Crisper helps faint print"}</span>
        </div>
        <div className="flex items-center gap-2">
          {mode === "new" && onAsIs && !failed && <button onClick={onAsIs} disabled={!!busy} className="min-h-[44px] pr-2 text-left text-[15px] text-white/85 disabled:opacity-50">Keep the photo as it is</button>}
          {mode === "kept" && onOriginal && (
            <button onClick={async () => { setBusy("Putting the original back…"); try { await onOriginal(); } catch { setBusy(null); } }} disabled={!!busy}
              className="min-h-[44px] pr-2 text-left text-[15px] text-white/85 disabled:opacity-50">Back to the original</button>
          )}
          <button onClick={() => void keep()} disabled={!work || !corners || !!busy}
            className="ml-auto min-h-[44px] px-6 rounded-xl bg-white text-[#1d1813] text-[15px] font-medium disabled:opacity-50">
            {mode === "new" ? "Keep it" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
