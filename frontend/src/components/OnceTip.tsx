/**
 * A tip shown once, at the moment it's useful, then never again: ✕ puts it away, and so does using the thing it's
 * about (Oct 2: Ken asked how iPhone apps help people know what to do — one small tip, in place, beats a manual).
 */
import { useCallback, useState } from "react";

export function useOnceTip(id: string): [boolean, () => void] {
  const key = `wander:tip:${id}`;
  const [show, setShow] = useState(() => { try { return localStorage.getItem(key) !== "1"; } catch { return false; } });
  const done = useCallback(() => {
    try { localStorage.setItem(key, "1"); } catch { /* private window */ }
    setShow(false);
  }, [key]);
  return [show, done];
}

export default function OnceTip({ children, onClose, className = "" }: { children: React.ReactNode; onClose: () => void; className?: string }) {
  return (
    <div role="note" className={`flex items-start gap-1 rounded-lg bg-[#fff6e6] border border-[#ecd9b4] pl-3 text-[13px] leading-snug text-[#5c4a2e] ${className}`}>
      <p className="flex-1 py-2.5">{children}</p>
      <button type="button" onClick={onClose} aria-label="Hide this tip" className="min-h-[44px] min-w-[44px] text-[#6b5d4a]">✕</button>
    </div>
  );
}
