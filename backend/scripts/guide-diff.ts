/**
 * What changed between two downloads of her Guide — read straight from both .xlsx files, before importing: tabs added,
 * removed or renamed (matched by their words), and every cell whose words changed, with how many pictures each tab has.
 * Long digit runs are masked. Read-only; never contacts Google.
 *
 *   npx tsx scripts/guide-diff.ts <old.xlsx> <new.xlsx>
 */
import ExcelJS from "exceljs";

const words = (v: any): string => {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  if (v instanceof Date) return v.getUTCFullYear() <= 1900 ? `${v.getUTCHours()}:${String(v.getUTCMinutes()).padStart(2, "0")}` : v.toISOString().slice(0, 10);
  if (v.richText) return v.richText.map((r: any) => r.text).join("");
  if ("text" in v) return words(v.text);
  if ("result" in v) return words(v.result);
  return "";
};
const mask = (s: string) => s.replace(/\b(?:\d[ -]?){13,19}\b/g, "[digits hidden]");
type Tab = { cells: Map<string, string>; links: Map<string, string>; images: number };

async function read(file: string): Promise<Map<string, Tab>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const tabs = new Map<string, Tab>();
  wb.eachSheet((ws) => {
    const cells = new Map<string, string>(), links = new Map<string, string>();
    ws.eachRow((row) => row.eachCell((c) => {
      if (c.isMerged && c.master.address !== c.address) return;
      const t = words(c.value).trim();
      if (t) cells.set(c.address, t);
      const link = (c.value as any)?.hyperlink;
      if (link) links.set(c.address, String(link));
    }));
    tabs.set(ws.name, { cells, links, images: ws.getImages().length });
  });
  return tabs;
}

const [oldFile, newFile] = process.argv.slice(2);
if (!oldFile || !newFile) throw new Error("Usage: guide-diff.ts <old.xlsx> <new.xlsx>");
const [a, b] = await Promise.all([read(oldFile), read(newFile)]);
const oldOnly = [...a.keys()].filter((t) => !b.has(t)), newOnly = [...b.keys()].filter((t) => !a.has(t));
const sig = (m: Tab) => new Set([...m.cells.values()].map((x) => x.slice(0, 60)));
const renamed: [string, string, number][] = [];
for (const o of oldOnly) {
  const so = sig(a.get(o)!);
  let best: string | null = null, bestShare = 0;
  for (const n of newOnly) { const sn = sig(b.get(n)!); const share = [...so].filter((x) => sn.has(x)).length / Math.max(1, so.size); if (share > bestShare) { best = n; bestShare = share; } }
  if (best && bestShare >= 0.5) renamed.push([o, best, Math.round(bestShare * 100)]);
}
console.log(`TABS: ${a.size} before, ${b.size} now`);
console.log(`renamed: ${renamed.map(([o, n, p]) => `"${o}" → "${n}" (${p}% same words)`).join(" | ") || "none"}`);
console.log(`removed: ${oldOnly.filter((o) => !renamed.some((r) => r[0] === o)).join(" | ") || "none"}`);
console.log(`added: ${newOnly.filter((n) => !renamed.some((r) => r[1] === n)).join(" | ") || "none"}`);
let changedTabs = 0;
const pairs: [string, string][] = [...[...a.keys()].filter((t) => b.has(t)).map((t) => [t, t] as [string, string]), ...renamed.map(([o, n]) => [o, n] as [string, string])];
for (const [o, n] of pairs) {
  const A = a.get(o)!, B = b.get(n)!;
  const changed: [string, string, string][] = [], added: [string, string][] = [], removed: [string, string][] = [], relinked: string[] = [];
  for (const [k, v] of B.cells) { if (!A.cells.has(k)) added.push([k, v]); else if (A.cells.get(k) !== v) changed.push([k, A.cells.get(k)!, v]); }
  for (const [k, v] of A.cells) if (!B.cells.has(k)) removed.push([k, v]);
  for (const [k, v] of B.links) if (A.links.get(k) !== v && A.cells.get(k) === B.cells.get(k)) relinked.push(k);
  if (!changed.length && !added.length && !removed.length && !relinked.length && A.images === B.images) continue;
  changedTabs++;
  console.log(`\n=== ${o === n ? o : `${o} → ${n}`}: ${changed.length} changed, ${added.length} new, ${removed.length} gone${relinked.length ? `, ${relinked.length} new link(s)` : ""}${A.images !== B.images ? `, pictures ${A.images} → ${B.images}` : ""}`);
  const show = (s: string) => mask(s.replace(/\s+/g, " ")).slice(0, 160);
  for (const [k, x, y] of changed.slice(0, 40)) console.log(`  ~ ${k}: "${show(x)}" → "${show(y)}"`);
  for (const [k, y] of added.slice(0, 40)) console.log(`  + ${k}: "${show(y)}"`);
  for (const [k, x] of removed.slice(0, 40)) console.log(`  - ${k}: "${show(x)}"`);
  for (const k of relinked.slice(0, 20)) console.log(`  ↗ ${k}: a new link`);
  if (changed.length > 40 || added.length > 40 || removed.length > 40) console.log("  … (more)");
}
console.log(`\n${changedTabs} tab${changedTabs === 1 ? "" : "s"} changed.`);
