/** A Guide detail as written, line by line, with phone numbers you can tap to call and web addresses as short links. */

import { withPhoneLinks, withWebLinks } from "../lib/guideDisplay";

// Padding makes a tap area finger-sized (44pt) without moving the words around it
const LINK = "inline-block py-3 -my-3 underline underline-offset-2 text-[#514636] whitespace-nowrap";

/** Her words with web addresses as short links ("michelin.com ↗") and phone numbers to call. Web addresses are
 * found first, so the digits in one are never read as a phone number. */
export function LinkedText({ text, phones = true }: { text: string; phones?: boolean }) {
  return (
    <>
      {withWebLinks(text).map((part, n) =>
        part.url ? (
          <a key={n} href={part.url} target="_blank" rel="noopener noreferrer" className={LINK}>{part.text}</a>
        ) : phones ? (
          withPhoneLinks(part.text).map((p, k) =>
            p.tel ? <a key={`${n}-${k}`} href={`tel:${p.tel}`} className={LINK}>{p.text}</a> : <span key={`${n}-${k}`}>{p.text}</span>,
          )
        ) : (
          <span key={n}>{part.text}</span>
        ),
      )}
    </>
  );
}

export default function GuideText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line [overflow-wrap:anywhere] ${className}`}>
      <LinkedText text={text} />
    </p>
  );
}
