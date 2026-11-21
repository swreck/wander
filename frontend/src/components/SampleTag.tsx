/**
 * How a sample is drawn (December plan S2c, D7, Nov 17 2026): grey italic words, a small "Sample" pill, a picture that is
 * only a drawn panel with a diagonal "SAMPLE" band. One family, and it has no actions: no link, no map link, no "Ask
 * Scout", no send, no edit, no remove, no "I'm in", no photo lookup, no "about this place". A tap opens one sentence and a
 * second tap closes it. This file imports no lookup and no sender; nothing in it can make a request or hand words off the
 * phone. Every element it draws carries data-sample="1".
 */
import { useState } from "react";
import type { SampleItem } from "../lib/samples";

/** The one class for every word of a sample */
export const SAMPLE_TEXT = "italic text-[#6f6a64]";
const SAMPLE_SENTENCE = "A sample. Nothing is planned here yet.";
const NOT_CONFIRMED_SENTENCE = "Not confirmed yet, so it isn't in the plan.";

/** The small pill before the first word: "Sample", or "Not confirmed" (a row's own tag) */
export function SampleTag({ label = "Sample" }: { label?: string }) {
  // (the hidden ": " is for a screen reader, which ran "Sample" and the first words together)
  return <span data-sample="1" className="inline-block align-middle mr-1.5 px-1.5 py-px rounded-full border border-[#d6ccbc] bg-white/70 text-[11px] not-italic leading-snug text-[#6f6a64]">{label}<span data-sample="1" className="sr-only">: </span></span>;
}

/** A placeholder picture, drawn here (no file, no request): a soft grey panel with a diagonal "SAMPLE" band */
export function SamplePicture({ className = "aspect-[16/9] rounded-lg", label = "A sample picture" }: { className?: string; label?: string }) {
  return (
    <div data-sample="1" role="img" aria-label={label} className={`relative overflow-hidden bg-[#ece8e1] ${className}`}>
      <svg data-sample="1" aria-hidden="true" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <rect data-sample="1" width="160" height="90" fill="#ece8e1" />
        <g data-sample="1" transform="rotate(-24 80 45)">
          <rect data-sample="1" x="-30" y="34" width="220" height="22" fill="#d9d3c8" />
          <text data-sample="1" x="80" y="49" textAnchor="middle" fontSize="11" letterSpacing="3" fill="#6f6a64" fontFamily="system-ui, sans-serif">SAMPLE</text>
        </g>
      </svg>
    </div>
  );
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** One sample in a list: a time (when it has one), the pill, its words; a tap says what it is */
export function SampleRow({ sample, timeWords = null, zone = null, under = null }: { sample: SampleItem; timeWords?: string | null; zone?: string | null; under?: string | null }) {
  const [open, setOpen] = useState(false);
  const d = sample.data;
  const unconfirmed = sample.kind === "unconfirmed";
  const title = text(d.title) || text(d.text) || text(d.caption);
  const detail = text(d.detail);
  const forWhom = text(d.forWhom);
  const from = text(d.from);
  return (
    <li data-sample="1" className="rounded-xl border border-dashed border-[#d6ccbc] bg-white/60">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-sample="1" className="w-full flex items-start gap-3 px-3 py-2 min-h-[44px] text-left">
        {/* (the clock's words sit under the time in smaller type, as on a real line: "9:30 AM Vietnam time" in one size
            wrapped to three lines in this column) */}
        {timeWords !== null && (
          <span data-sample="1" className={`w-16 shrink-0 text-right text-sm ${SAMPLE_TEXT}`}>
            {timeWords}
            {zone && <span data-sample="1" className="block text-xs">{zone}</span>}
          </span>
        )}
        <span data-sample="1" className={`flex-1 min-w-0 text-sm leading-snug ${SAMPLE_TEXT}`}>
          <SampleTag label={unconfirmed ? text(d.tag) || "Not confirmed" : "Sample"} />
          {title}
          {detail && <span data-sample="1" className="block mt-0.5 whitespace-pre-line">{detail}</span>}
          {forWhom && <span data-sample="1" className="block mt-0.5">For {forWhom}</span>}
          {/* (a sample note says which day it would sit under, as a real note does) */}
          {under && <span data-sample="1" className="block mt-0.5 text-xs">{under}</span>}
        </span>
      </button>
      {d.picture === true && <div data-sample="1" className="px-3 pb-3"><SamplePicture /></div>}
      {open && (
        <p data-sample="1" className={`px-3 pb-3 text-sm ${SAMPLE_TEXT}`}>
          {unconfirmed ? NOT_CONFIRMED_SENTENCE : SAMPLE_SENTENCE}{unconfirmed && from ? ` From ${from}.` : ""}
        </p>
      )}
    </li>
  );
}
