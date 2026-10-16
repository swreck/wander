import { PrismaClient } from "@prisma/client";

// The database sleeps when nobody uses Wander (Neon bills each minute it's awake; cost audit, Oct 16 2026) — the first
// question after it wakes waits for it: 15 s allowed to connect, not Prisma's 5, so a slow wake isn't an error
function urlWithWake(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "15");
    return u.toString();
  } catch {
    return raw;
  }
}

const url = urlWithWake();
const prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();

export default prisma;
