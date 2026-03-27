import { randomUUID } from "crypto";

interface CaptureSessionItem {
  name: string;
  description: string | null;
  userNotes: string | null;
  themes: string[];
  cityName: string | null;
  sourceImageUrl: string | null;
}

interface CaptureSession {
  id: string;
  tripId: string;
  items: CaptureSessionItem[];
  createdAt: number;
  updatedAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // check every minute

const sessions = new Map<string, CaptureSession>();

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > TTL_MS) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function createSession(tripId: string): CaptureSession {
  const session: CaptureSession = {
    id: randomUUID(),
    tripId,
    items: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): CaptureSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.updatedAt > TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function appendToSession(sessionId: string, items: CaptureSessionItem[]): CaptureSession | null {
  const session = getSession(sessionId);
  if (!session) return null;
  session.items.push(...items);
  session.updatedAt = Date.now();
  return session;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function getSessionCount(sessionId: string): number {
  const session = getSession(sessionId);
  return session?.items.length ?? 0;
}
