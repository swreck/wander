/**
 * Tell Wander's server what this phone saw when Wander stepped in for something only a real phone does (Oct 11 2026) —
 * the tab bar finding iOS's screen keyboard-short, Scout finding an answer the line dropped. It lands in the server's
 * log only (routes/phoneReports.ts), so ordinary use shows whether a fix acted. Numbers and short words only; never
 * anyone's words. Never waits, never retries, never shows anything.
 */
export function phoneReport(what: "tabbar" | "scout-drop" | "paper" | "scout-caret" | "notes-caret", fields: Record<string, number | string | boolean>): void {
  try {
    const token = localStorage.getItem("wander_token");
    if (!token) return;
    void fetch("/api/phone-reports", {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ what, ...fields }),
    }).catch(() => { /* no line: nothing to tell */ });
  } catch { /* storage blocked: nothing to tell */ }
}
