/** A Guide detail as written, line by line, with phone numbers you can tap to call. */

import { withPhoneLinks } from "../lib/guideDisplay";

export default function GuideText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line [overflow-wrap:anywhere] ${className}`}>
      {withPhoneLinks(text).map((part, n) =>
        part.tel ? (
          // Padding makes the tap area finger-sized (44pt) without moving the words around it
          <a key={n} href={`tel:${part.tel}`} className="inline-block py-3 -my-3 underline underline-offset-2 text-[#514636] whitespace-nowrap">{part.text}</a>
        ) : (
          <span key={n}>{part.text}</span>
        ),
      )}
    </p>
  );
}
