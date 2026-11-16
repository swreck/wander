// Recent exchange rates per US dollar for the currency pop-up on trip expenses (dong, riel, yen).
// Not for Japan's payments: those keep the yen and rate stored on each row (expenses.ts yenPerDollar).

export type Foreign = "JPY" | "VND" | "KHR";
export type Currency = Foreign | "USD";
export type Rate = { rate: number; asOf: string | null; approx: boolean };
export type Rates = Record<Foreign, Rate>;
export type RatesOptions = { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number };

export const RATE_SOURCE = "https://open.er-api.com/v6/latest/USD";

// Round figures when nothing is known, and the range a real rate can fall in (a rate outside it is a bad answer, never shown)
const FOREIGN: Foreign[] = ["JPY", "VND", "KHR"];
const ROUND: Record<Foreign, number> = { JPY: 150, VND: 25000, KHR: 4100 };
const SANE: Record<Foreign, [number, number]> = { JPY: [50, 400], VND: [15_000, 40_000], KHR: [3000, 6000] };

const KEEP_MS = 12 * 3600_000;   // a complete good answer
const RETRY_MS = 10 * 60_000;    // a failed or partial one

// Last good rate per currency, kept on its own so one missing currency doesn't lose the others
let good: Partial<Record<Foreign, { rate: number; asOf: string | null }>> = {};
let nextAsk = -Infinity;
let inflight: Promise<void> | null = null;

export function forgetRates(): void { good = {}; nextAsk = -Infinity; inflight = null; }

const sane = (c: Foreign, v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= SANE[c][0] && v <= SANE[c][1];

/** The day an answer is from as YYYY-MM-DD, or null when it can't be read */
function dayOf(utc: unknown): string | null {
  if (typeof utc !== "string") return null;
  const ms = Date.parse(utc);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

async function ask(o: Required<RatesOptions>): Promise<void> {
  let complete = false;
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced as well as aborted, so a fetcher that ignores the signal still can't hold anyone up. The clock covers the body
  // as well as the headers: every caller waits on this one ask, so an answer that stalls halfway would stall them all.
  const gaveUp = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new Error("timeout")); }, o.timeoutMs); });
  gaveUp.catch(() => {}); // when it fires with nobody racing it, it must not take the server down
  try {
    const res = await Promise.race([o.fetcher(RATE_SOURCE, { signal: ctl.signal }), gaveUp]);
    if (res && res.ok) {
      const data = await Promise.race([res.json(), gaveUp]) as any;
      if (data?.result === "success" && data.base_code === "USD" && data.rates && typeof data.rates === "object") {
        const asOf = dayOf(data.time_last_update_utc);
        complete = true;
        for (const c of FOREIGN) {
          if (sane(c, data.rates[c])) good[c] = { rate: data.rates[c], asOf };
          else complete = false;
        }
      }
    }
  } catch { /* the source is down: keep what we have */ }
  finally { clearTimeout(timer); }
  nextAsk = o.now() + (complete ? KEEP_MS : RETRY_MS);
}

/** Recent rates per dollar. Never throws, never waits long: a failed ask gives the last good rate, else a round figure said to be approximate. */
export async function ratesPerDollar(opts: RatesOptions = {}): Promise<Rates> {
  const o: Required<RatesOptions> = {
    fetcher: opts.fetcher ?? fetch,
    now: opts.now ?? Date.now,
    timeoutMs: opts.timeoutMs ?? 6000,
  };
  if (o.now() >= nextAsk) {
    inflight ??= ask(o).finally(() => { inflight = null; });
    await inflight;
  } else if (inflight) await inflight;
  const out = {} as Rates;
  for (const c of FOREIGN) {
    const g = good[c];
    out[c] = g ? { rate: g.rate, asOf: g.asOf, approx: false } : { rate: ROUND[c], asOf: null, approx: true };
  }
  return out;
}

/** To the nearest cent; halves go away from zero and float noise (12.345 * 100) doesn't tip them down */
function cents(n: number): number {
  const r = Math.round(Number((Math.abs(n) * 100).toPrecision(12))) / 100;
  return (n < 0 ? -r : r) + 0;
}

const usable = (rates: Partial<Rates> | undefined, c: Currency): number | null => {
  if (c === "USD") return 1;
  const r = Object.hasOwn(rates ?? {}, c) ? rates![c as Foreign]?.rate : undefined;
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
};

/** An amount in a currency as dollars, to the cent. Null for a currency or amount it can't stand behind. */
export function toDollars(amount: number, currency: Currency, rates: Partial<Rates>): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const rate = usable(rates, currency);
  return rate === null ? null : cents(amount / rate);
}

/** Dollars as an amount in a currency: whole dong, riel and yen; cents for dollars. */
export function fromDollars(dollars: number, currency: Currency, rates: Partial<Rates>): number | null {
  if (typeof dollars !== "number" || !Number.isFinite(dollars)) return null;
  const rate = usable(rates, currency);
  if (rate === null) return null;
  if (currency === "USD") return cents(dollars);
  const whole = Math.round(Number((Math.abs(dollars * rate)).toPrecision(12)));
  return (dollars < 0 ? -whole : whole) + 0;
}
