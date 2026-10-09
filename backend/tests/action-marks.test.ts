/**
 * MARKED DONE IN WANDER (Oct 9 2026). Ken: Actions "seems to include old actions, non actions, and actions not for me".
 * Her Guide's to-dos can only be ticked in her sheet, and some of her lists have no status column, so in Wander they could
 * never finish. The person a to-do or deadline is for marks it done in Wander — beside her list, never in it:
 * - a member marks a to-do or deadline done, and not done again; it says who and when; ticking twice keeps one
 * - someone not on the trip gets nothing; a made-up key is refused
 * - her to-do stays as her sheet has it (a re-read can't erase the mark, and nothing is written to her list)
 * - Scout's to-do list says it was marked done, by whom; Scout's deadline status says done — never remind anyone
 * - Scout can mark a deadline done by its words
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-action-marks";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const { buildGuideContextParts } = await import("../src/services/guide/scoutContext.js");
const { todoKey, deadlineKey } = await import("../src/services/actionMarks.js");
const prisma = new PrismaClient();

let tripId = "", a = "", outsider = "", aId = "", todoId = "";
const DEADLINE = "Reconfirm the Harbor Grill dinner (Oct 17) or it is auto-cancelled";
beforeAll(async () => {
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const ta = await mk("AMPlanner"), to = await mk("AMOutsider");
  aId = ta.id;
  tripId = (await prisma.trip.create({ data: { name: "AM Marks Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId: ta.id, role: "planner" } });
  a = signToken({ code: "AMPlanner", displayName: "AMPlanner", travelerId: ta.id });
  outsider = signToken({ code: "AMOutsider", displayName: "AMOutsider", travelerId: to.id });
  todoId = (await prisma.planningAction.create({ data: { tripId, action: "Cash at ATM", owner: "AB / JD", status: "open", sheetRowRef: "Actions|AB / JD Actions|Cash at ATM", notes: "In her list" } })).id;
  const snap = await prisma.guideSnapshot.create({ data: { tripId, sourceName: "am.xlsx", sourceKind: "xlsx", contentHash: "am", status: "current", tabs: [] } });
  await prisma.guideItem.create({ data: { tripId, snapshotId: snap.id, kind: "deadline", source: "Dining Resos (row 3)", sourceRef: "Dining Resos!J3", date: new Date("2031-10-14T00:00:00Z"), title: DEADLINE } });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});
const put = (t: string, body: object) => request(app).put(`/api/action-marks/${tripId}`).set("Authorization", `Bearer ${t}`).send(body);
const get = (t: string) => request(app).get(`/api/action-marks/${tripId}`).set("Authorization", `Bearer ${t}`);

describe("marked done in Wander", () => {
  it("a member marks her to-do done — who and when — and ticking twice keeps one", async () => {
    const key = todoKey({ id: todoId, sheetRowRef: "Actions|AB / JD Actions|Cash at ATM" });
    const one = await put(a, { key, label: "Cash at ATM", done: true });
    expect(one.status).toBe(200);
    expect(one.body.mark).toMatchObject({ key, label: "Cash at ATM", byName: "AMPlanner" });
    await put(a, { key, label: "Cash at ATM", done: true });
    const list = await get(a);
    expect(list.body.filter((m: { key: string }) => m.key === key)).toHaveLength(1);
    // her to-do itself is as her sheet has it
    expect((await prisma.planningAction.findUnique({ where: { id: todoId } }))!.status).toBe("open");
  });
  it("…and not done again", async () => {
    const key = todoKey({ id: todoId, sheetRowRef: "Actions|AB / JD Actions|Cash at ATM" });
    await put(a, { key, label: "Cash at ATM", done: false });
    expect((await get(a)).body.some((m: { key: string }) => m.key === key)).toBe(false);
  });
  it("someone not on the trip gets nothing, and can't mark", async () => {
    expect((await get(outsider)).status).toBe(403);
    expect((await put(outsider, { key: "todo:x", label: "x", done: true })).status).toBe(403);
  });
  it("a made-up key is refused", async () => {
    expect((await put(a, { key: "anything", label: "x", done: true })).status).toBe(400);
  });
  it("Scout: her to-do ticked through Scout is marked in Wander, not changed in her list, and its list says by whom", async () => {
    const user = { code: "AMPlanner", displayName: "AMPlanner", travelerId: aId } as any;
    const r = await executeTool("set_todo_done", { tripId, todoId, done: true }, user);
    expect(r.result.markedInWander).toBe(true);
    expect((await prisma.planningAction.findUnique({ where: { id: todoId } }))!.status).toBe("open");
    const list = await executeTool("get_todos", { tripId }, user);
    const t = list.result.todos.find((x: { id: string }) => x.id === todoId);
    expect(t.done).toBe(true);
    expect(t.markedDoneInWander).toMatch(/^by AMPlanner on \d{4}-\d{2}-\d{2}/);
  });
  it("Scout marks a deadline done by its words; its status then says done — never remind anyone", async () => {
    const user = { code: "AMPlanner", displayName: "AMPlanner", travelerId: aId } as any;
    const r = await executeTool("set_deadline_done", { tripId, deadline: "reconfirm the harbor grill", done: true }, user);
    expect(r.result.updated).toBe(true);
    expect((await get(a)).body.some((m: { key: string }) => m.key === deadlineKey({ title: DEADLINE, date: new Date("2031-10-14T00:00:00Z") }))).toBe(true);
    const { liveLines } = await buildGuideContextParts(tripId, { now: new Date("2031-10-12T09:00:00+09:00"), phoneZone: "Asia/Tokyo" });
    expect(liveLines.find((l) => /Harbor Grill/.test(l.text))?.text).toMatch(/OPEN NOW[\s\S]*MARKED DONE in Wander by AMPlanner[\s\S]*never remind anyone to do it/);
  });
});
