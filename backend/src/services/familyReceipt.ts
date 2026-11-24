/**
 * A receipt's photo on a trip whose payers are families (Nov 23 2026). Japan's reader (services/expenses.ts readReceipt)
 * knows yen and dollars and is told "a trip in Japan"; it stays as it is. This trip runs through Vietnam, Cambodia and
 * Japan, so its reader gives dong, riel, yen or US dollars, or no money at all when the receipt doesn't say and the
 * place doesn't tell: the entry sheet then keeps the money the person chose, or the day's. Never a guess.
 *
 * Nothing is kept here. The person checks what was read, says who paid, and keeps it with the payment.
 */
import Anthropic from "@anthropic-ai/sdk";
import prisma from "./db.js";
import { townName, type PaperFile } from "./papers.js";
import { amountKept, moneyOfCountry, MOST } from "./familyExpenses.js";
import type { Currency } from "./rates.js";

const MONEYS: Currency[] = ["VND", "KHR", "JPY", "USD"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["total", "currency", "what", "date"],
  properties: {
    total: { type: "number", description: "The grand total paid, as a plain number with no grouping (1250000, 12.5); 0 when no total can be read" },
    currency: { type: "string", enum: [...MONEYS, ""], description: "VND for dong, KHR for riel, JPY for yen, USD for US dollars; empty when the money can't be told" },
    what: { type: "string", description: "What it was for, in one to four plain English words a traveller would say: \"Taxi\", \"Dinner at Madame Hien\", \"Temple pass\", \"Pharmacy\"; empty when it can't be told" },
    date: { type: "string", description: "The day it was paid, YYYY-MM-DD, from the list given; empty when the receipt doesn't say or it isn't one of them" },
  },
};

const SYSTEM = `You read a receipt someone photographed on a trip through Vietnam, Cambodia and Japan, to keep the payment in the group's shared budget.
Be faithful: only what the receipt shows.

The total is the grand total paid, never a subtotal, a tax or service-charge line, the cash handed over or the change given back. On a Vietnamese bill it is "Tổng cộng", "Tổng thanh toán" or "Tổng tiền", at the foot; on a Japanese one 合計, 合計金額 or お支払; on an English one "Total", "Grand Total" or "Amount Due".

The number: dong, riel and yen have no cents, and their thousands are grouped with a dot or a comma, so "1.250.000" and "1,250,000" are both 1250000. Dollars have cents: "12.50" is 12.5. Give the number whole, never shortened.

The money is the one printed with the total: đ, ₫, VND or "đồng" is VND; ៛, KHR or "riel" is KHR; ¥, 円 or JPY is JPY; $, US$ or USD is USD. With no money printed, it is the money of the country the receipt is plainly from, by its language and its address: a Vietnamese bill is VND, a Japanese one JPY. A Cambodian receipt can be in US dollars, in riel, or in both: when it prints the total in both, give the dollar total and USD; when it prints no money, tell from its prices (a coffee at 2.50 is dollars, at 10000 riel). When the money still can't be told, give "" for the currency. Never guess it from the list of days alone.

"what" names what was bought the way a traveller would, in plain English: a taxi or ride receipt is "Taxi"; a restaurant's is "Dinner at <name>" or "Lunch at <name>" by the time if its name is clear, else "Meal"; a shop's is the shop's kind or name.
Never put a card number, an approval or slip number, a phone number, a person's name or a tax or registration number in "what".

The date: receipts in Vietnam and Cambodia print the day first (26/12/2026 is December 26). Give it only when it is one of the trip's days in the list.`;

const moneyWords = (country: string | null | undefined) => {
  const m = moneyOfCountry(country);
  return m === "VND" ? "dong" : m === "KHR" ? "US dollars and riel" : m === "JPY" ? "yen" : null;
};

export type FamilyReceiptRead = { amount: number | null; currency: Currency | null; what: string; date: string | null };

let client: Anthropic | null = null;
/** What a receipt says: its total, its money when that can be told, what it was for, and the trip day it was paid.
 *  Null when it can't be read (the person types the amount; the photo is still kept with the payment). */
export async function readFamilyReceipt(tripId: string, file: PaperFile): Promise<FamilyReceiptRead | null> {
  if (!file.mediaType.startsWith("image/")) return null;
  client ??= new Anthropic();
  const rows = await prisma.day.findMany({ where: { tripId }, select: { date: true, city: { select: { name: true, country: true } } }, orderBy: { date: "asc" } });
  const days = rows.map((d) => {
    const date = d.date.toISOString().slice(0, 10), town = townName(d.city?.name || ""), country = (d.city?.country || "").trim(), money = moneyWords(country);
    return { date, line: `${date} ${town}${country ? `, ${country}` : ""}${money ? ` (${money})` : ""}` };
  });
  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } },
        { type: "text", text: `The trip's days, each with its town, its country and the money used there:\n${days.map((d) => d.line).join("\n")}` },
      ] }],
    } as any, { timeout: 45_000, maxRetries: 0 });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    const r = text ? JSON.parse(text) : null;
    if (!r || typeof r !== "object") return null;
    const currency = MONEYS.find((m) => m === r.currency) ?? null;
    const n = typeof r.total === "number" ? r.total : NaN;
    // (with no money told, the number is kept only when it could be an amount in some money Wander keeps)
    const amount = currency ? amountKept(n, currency) : Number.isFinite(n) && n > 0 && n <= MOST.VND ? Math.round(n * 100) / 100 : null;
    const date = typeof r.date === "string" && days.some((d) => d.date === r.date) ? r.date : null;
    // (never a run of digits in what it says it was for: a card or slip number slipped in would be shown to every family)
    const what = String(r.what || "").replace(/[\d*]{4,}/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    return { amount, currency, what, date };
  } catch (e: any) {
    console.warn(`[budget] couldn't read a receipt: ${e?.status ?? e?.message ?? "unknown"}`);
    return null;
  }
}
