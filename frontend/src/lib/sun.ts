/**
 * When the sun sets on a day, at a place, worked out on the phone — no lookup, no signal needed (Oct 15 2026: "the
 * feature or info or view the user would want before they realize they want it"; Andy's photos, a temple garden before
 * it's dark). The sunrise equation, good to a minute or two; said as "about".
 */
const RAD = Math.PI / 180;

/** Minutes after midnight on the trip's clock (zone given as minutes ahead of UTC: Japan 540) — null in a polar night */
export function sunsetMinutes(lat: number, lng: number, date: string, zoneMinutes = 540): number | null {
  const jd = Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 2440587.5;
  const n = Math.ceil(jd - 2451545.0 + 0.0008);
  const jStar = n - lng / 360;
  const m = (357.5291 + 0.98560028 * jStar) % 360;
  const c = 1.9148 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 0.0003 * Math.sin(3 * m * RAD);
  const lambda = (m + c + 180 + 102.9372) % 360;
  const transit = 2451545.0 + jStar + 0.0053 * Math.sin(m * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const dec = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD));
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(dec)) / (Math.cos(lat * RAD) * Math.cos(dec));
  if (cosH < -1 || cosH > 1) return null;
  const set = transit + Math.acos(cosH) / RAD / 360;
  const utcMinutes = ((set - 2440587.5) * 86_400_000 - Date.parse(`${date}T00:00:00Z`)) / 60_000;
  return Math.round(utcMinutes + zoneMinutes);
}

/** "5:08 PM" */
export const clockWords = (min: number) => {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
