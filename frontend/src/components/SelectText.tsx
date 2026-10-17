/**
 * One of Scout's answers, full screen, to choose the words to copy (Oct 17 2026; Ken: "I see the copy button for a scout
 * message. Can you add a select to copy parts"). In Scout's panel a long press had given "tactile feedback but doesn't
 * actually select anything" (Oct 4); here the words sit alone in a plain box the iPhone selects as it does everywhere:
 * press and hold, drag the handles, Copy. "Copy all" too; Done, the phone's Back or Escape closes it.
 */
import { useEffect, useRef, useState } from "react";
import useBackToClose from "../hooks/useBackToClose";
import { lockScroll } from "../lib/scrollLock";

export default function SelectText({ text, onClose }: { text: string; onClose: () => void }) {
  useBackToClose(true, onClose);
  const box = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => lockScroll(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Choose the words to copy" className="fixed inset-0 z-[400] bg-[#faf8f5] flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-between px-4 border-b border-[#e5ddd0]">
        <p className="text-[15px] text-[#3a3128] py-3">Press and hold to choose words</p>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[64px] text-[15px] font-medium text-[#514636]">Done</button>
      </div>
      {/* (read-only: no keyboard comes up, and nothing can be changed — only chosen and copied) */}
      <textarea ref={box} readOnly value={text} aria-label="Scout's answer"
        className="flex-1 w-full resize-none bg-transparent px-4 py-3 text-[17px] leading-relaxed text-[#3a3128] outline-none" />
      <div className="px-4 py-2 border-t border-[#e5ddd0] flex items-center justify-between">
        <p className="text-[13px] text-[#6b5d4a]">Drag the handles, then tap Copy.</p>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* the words can still be chosen */ } }}
          className="min-h-[44px] px-3 text-[15px] text-[#514636] underline underline-offset-2">{copied ? "✓ Copied all" : "Copy all"}</button>
      </div>
    </div>
  );
}
