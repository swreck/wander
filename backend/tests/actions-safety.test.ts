/**
 * ACTIONS TO-DOS (Sep 30 2026, round 12) — read back from the database.
 * - A to-do added in Wander can be removed (a tester's couldn't: there was no way to).
 * - A to-do from Larisa's Guide can't be removed in Wander (it goes when she takes it out of her sheet).
 * - Only the trip's own people read, add, change or remove its to-dos (the routes checked sign-in only).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-actions-safety";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

let tripId = "";
let member = "";
let outsider = "";
let fromGuide = "";
let other = "";
let guideBoth = "";

beforeAll(async () => {
  const trip = await prisma.trip.create({ data: { name: "AS Actions Trip", status: "archived" } });
  tripId = trip.id;
  const a = await prisma.traveler.findFirst({ where: { displayName: "ASMember" } }) || await prisma.traveler.create({ data: { displayName: "ASMember" } });
  const b = await prisma.traveler.findFirst({ where: { displayName: "ASOutsider" } }) || await prisma.traveler.create({ data: { displayName: "ASOutsider" } });
  const c = await prisma.traveler.findFirst({ where: { displayName: "ASOther" } }) || await prisma.traveler.create({ data: { displayName: "ASOther" } });
  await prisma.tripMember.create({ data: { tripId, travelerId: a.id, role: "traveler" } });
  await prisma.tripMember.create({ data: { tripId, travelerId: c.id, role: "traveler" } });
  member = signToken({ code: "ASMember", displayName: "ASMember", travelerId: a.id });
  outsider = signToken({ code: "ASOutsider", displayName: "ASOutsider", travelerId: b.id });
  other = signToken({ code: "ASOther", displayName: "ASOther", travelerId: c.id });
  fromGuide = (await prisma.planningAction.create({ data: { tripId, action: "Book the ryokan", owner: "LF", status: "open", sheetRowRef: "Actions!3" } })).id;
  guideBoth = (await prisma.planningAction.create({ data: { tripId, action: "Itinerary discussion", owner: "Both", status: "open", sheetRowRef: "Actions!5" } })).id;
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("to-dos", () => {
  it("a member adds one and removes it — gone from the database", async () => {
    const add = await request(app).post("/api/sheets-sync/actions").set("Authorization", `Bearer ${member}`).send({ tripId, action: "Get yen" });
    expect(add.status).toBe(201);
    const del = await request(app).delete(`/api/sheets-sync/actions/${add.body.id}`).set("Authorization", `Bearer ${member}`);
    expect(del.status).toBe(200);
    expect(await prisma.planningAction.findUnique({ where: { id: add.body.id } })).toBeNull();
  });
  it("one from Larisa's Guide can't be removed in Wander, and stays", async () => {
    const del = await request(app).delete(`/api/sheets-sync/actions/${fromGuide}`).set("Authorization", `Bearer ${member}`);
    expect(del.status).toBe(403);
    expect(del.body.error).toContain("Larisa's Guide");
    expect(await prisma.planningAction.findUnique({ where: { id: fromGuide } })).not.toBeNull();
  });
  it("someone not on the trip can't read, add, change or remove its to-dos", async () => {
    expect((await request(app).get(`/api/sheets-sync/actions/${tripId}`).set("Authorization", `Bearer ${outsider}`)).status).toBe(403);
    expect((await request(app).post("/api/sheets-sync/actions").set("Authorization", `Bearer ${outsider}`).send({ tripId, action: "x" })).status).toBe(403);
    expect((await request(app).patch(`/api/sheets-sync/actions/${fromGuide}`).set("Authorization", `Bearer ${outsider}`).send({ status: "done" })).status).toBe(403);
    expect((await request(app).delete(`/api/sheets-sync/actions/${fromGuide}`).set("Authorization", `Bearer ${outsider}`)).status).toBe(403);
    expect((await prisma.planningAction.findUnique({ where: { id: fromGuide } }))!.status).toBe("open");
  });
  it("Scout's tools follow the same rules (add, tick off, take out; never one from her Guide)", async () => {
    const who = { code: "ASMember", displayName: "ASMember" };
    const added = await executeTool("add_todo", { tripId, action: "Buy Suica top-up" }, who);
    const id = added.result.todo.id;
    expect((await prisma.planningAction.findUnique({ where: { id } }))!.action).toBe("Buy Suica top-up");
    await executeTool("set_todo_done", { tripId, todoId: id, done: true }, who);
    expect((await prisma.planningAction.findUnique({ where: { id } }))!.status).toBe("done");
    const refused = await executeTool("remove_todo", { tripId, todoId: fromGuide }, who);
    expect(refused.result.error).toContain("Larisa's Guide");
    expect(await prisma.planningAction.findUnique({ where: { id: fromGuide } })).not.toBeNull();
    await executeTool("remove_todo", { tripId, todoId: id }, who);
    expect(await prisma.planningAction.findUnique({ where: { id } })).toBeNull();
  });
  it("only whoever added one can take it out — on screen and through Scout (round 12)", async () => {
    const add = await request(app).post("/api/sheets-sync/actions").set("Authorization", `Bearer ${member}`).send({ tripId, action: "Bring the rail pass" });
    expect(add.status).toBe(201);
    const id = add.body.id;
    expect((await prisma.planningAction.findUnique({ where: { id } }))!.createdBy).toBe("ASMember");
    const refused = await request(app).delete(`/api/sheets-sync/actions/${id}`).set("Authorization", `Bearer ${other}`);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toContain("ASMember's to-do");
    expect(await prisma.planningAction.findUnique({ where: { id } })).not.toBeNull();
    const byScout = await executeTool("remove_todo", { tripId, todoId: id }, { code: "ASOther", displayName: "ASOther" });
    expect(byScout.result.error).toContain("ASMember's to-do");
    expect(await prisma.planningAction.findUnique({ where: { id } })).not.toBeNull();
    expect((await request(app).delete(`/api/sheets-sync/actions/${id}`).set("Authorization", `Bearer ${member}`)).status).toBe(200);
    expect(await prisma.planningAction.findUnique({ where: { id } })).toBeNull();
  });
  it("Scout reads her Guide's \"Both\" as Andy & Larisa, never everyone (round 12)", async () => {
    const out = await executeTool("get_todos", { tripId }, { code: "ASMember", displayName: "ASMember" });
    const both = out.result.todos.find((t: { id: string }) => t.id === guideBoth);
    expect(both.for).toBe("Andy & Larisa");
  });
  it("a member reads them and marks one done", async () => {
    const list = await request(app).get(`/api/sheets-sync/actions/${tripId}`).set("Authorization", `Bearer ${member}`);
    expect(list.status).toBe(200);
    const done = await request(app).patch(`/api/sheets-sync/actions/${fromGuide}`).set("Authorization", `Bearer ${member}`).send({ status: "done" });
    expect(done.status).toBe(200);
    expect((await prisma.planningAction.findUnique({ where: { id: fromGuide } }))!.status).toBe("done");
  });
});
