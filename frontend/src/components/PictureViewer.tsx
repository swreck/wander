/**
 * One of her pictures, full screen — pinch or double-tap to zoom, drag to look around, Done or Back to close
 * (round 16: her five-panel Kyoto map, 2048 px wide, was squeezed into a 308-point box with no way to enlarge it;
 * on a laptop the sheet showed it full size — a reason to open the sheet instead). Top of the delight list too.
 */
import { useRef, useState } from "react";
import useBackToClose from "../hooks/useBackToClose";

type T = { s: number; x: number; y: number };
const MAX = 6;

export default function PictureViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useBackToClose(true, onClose);
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 });
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ t: T; d: number; mx: number; my: number } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const moved = useRef(false);

  // Keep the picture on screen: at a zoom of s, it can move at most (s − 1) × half the screen each way
  const clampT = (n: T): T => {
    const w = box.current?.clientWidth || window.innerWidth, h = box.current?.clientHeight || window.innerHeight;
    const s = Math.min(MAX, Math.max(1, n.s));
    const mx = ((s - 1) * w) / 2, my = ((s - 1) * h) / 2;
    return { s, x: Math.min(mx, Math.max(-mx, n.x)), y: Math.min(my, Math.max(-my, n.y)) };
  };
  const mid = () => { const p = [...pts.current.values()]; return { x: (p[0].x + (p[1] ?? p[0]).x) / 2, y: (p[0].y + (p[1] ?? p[0]).y) / 2 }; };
  const dist = () => { const p = [...pts.current.values()]; return p.length < 2 ? 1 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  const begin = () => { const m = mid(); start.current = { t, d: dist(), mx: m.x, my: m.y }; };

  // Zoom toward a point on screen (a double-tap's spot): that spot stays under the finger
  const zoomAt = (s: number, px: number, py: number) => {
    const r = box.current!.getBoundingClientRect();
    const cx = px - r.left - r.width / 2, cy = py - r.top - r.height / 2;
    const k = s / t.s;
    setT(clampT({ s, x: cx - (cx - t.x) * k, y: cy - (cy - t.y) * k }));
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex items-center justify-between px-3 text-white" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}>
        <p className="text-[13px] text-white/70 pl-1">{t.s > 1 ? "Drag to look around · double-tap to see it whole" : "Pinch or double-tap to zoom"}</p>
        <button onClick={onClose} className="min-h-[44px] min-w-[64px] text-[15px] font-medium text-white">Done</button>
      </div>
      <div ref={box} className="flex-1 overflow-hidden flex items-center justify-center select-none" style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          moved.current = false;
          setTouched(true);
          begin();
        }}
        onPointerMove={(e) => {
          if (!pts.current.has(e.pointerId) || !start.current) return;
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const st = start.current, m = mid();
          if (Math.hypot(m.x - st.mx, m.y - st.my) > 6 || pts.current.size > 1) moved.current = true;
          if (pts.current.size >= 2) setT(clampT({ s: st.t.s * (dist() / st.d), x: st.t.x + (m.x - st.mx), y: st.t.y + (m.y - st.my) }));
          else if (st.t.s > 1) setT(clampT({ s: st.t.s, x: st.t.x + (m.x - st.mx), y: st.t.y + (m.y - st.my) }));
        }}
        onPointerUp={(e) => {
          pts.current.delete(e.pointerId);
          if (pts.current.size) { begin(); return; }
          start.current = null;
          if (moved.current) return;
          // a double tap: zoom in there, or back to the whole picture
          const now = Date.now(), last = lastTap.current;
          if (last && now - last.at < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
            lastTap.current = null;
            if (t.s > 1) setT({ s: 1, x: 0, y: 0 }); else zoomAt(2.5, e.clientX, e.clientY);
          } else lastTap.current = { at: now, x: e.clientX, y: e.clientY };
        }}
        onPointerCancel={(e) => { pts.current.delete(e.pointerId); start.current = null; }}>
        <img src={src} alt={alt} draggable={false} className="max-w-full max-h-full object-contain"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: touched && pts.current.size ? "none" : "transform 160ms ease-out" }} />
      </div>
    </div>
  );
}
