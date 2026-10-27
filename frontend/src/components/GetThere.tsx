import { directionsHref } from "../lib/directions";

/**
 * Walk, Train or Taxi to a place, from where the phone is, in Google Maps: the same three buttons wherever a line names
 * somewhere you'd go, on Today and on Next (Ken, Oct 27: "The experience should be more consistent, and the simple ease
 * of tapping walk or taxi or train to somewhere seemed a good innovation, and the variation is just confusing" — Next's
 * card had the three, Now and every line of Today only "Maps ↗"). A day already past, or a link Wander can't route to
 * (a Michelin page), keeps a plain Maps link: nobody needs the way to yesterday's lunch.
 */
export default function GetThere({ href, name, dark = false, mapOnly = false, className = "mt-2" }: {
  href: string | null | undefined; name: string; dark?: boolean; mapOnly?: boolean; className?: string;
}) {
  if (!href) return null;
  const to = directionsHref(href);
  if (!to || mapOnly) {
    return (
      <a href={href} target="_blank" rel="noreferrer" aria-label={`${name} in Maps`}
        className={`inline-flex items-center min-h-[44px] text-sm underline underline-offset-2 ${dark ? "text-white" : "text-[#514636]"}`}>Maps ↗</a>
    );
  }
  // (the three share the width: on a 320-pt phone "Taxi" wrapped alone beside a label)
  return (
    <div className={`flex gap-2 ${className}`} data-get-there>
      {(["walk", "train", "taxi"] as const).map((w) => (
        <a key={w} href={directionsHref(href, w)!} target="_blank" rel="noreferrer"
          aria-label={`${{ walk: "Walk", train: "Train", taxi: "Taxi" }[w]} to ${name}, from where you are`}
          className={`flex-1 inline-flex items-center justify-center min-h-[44px] px-2 rounded-lg text-sm ${dark ? "bg-white/15 text-white" : "bg-[#efe8dc] text-[#3a3128]"}`}>
          {{ walk: "Walk", train: "Train", taxi: "Taxi" }[w]} ↗
        </a>
      ))}
    </div>
  );
}
