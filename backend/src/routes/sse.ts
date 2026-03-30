import { Router } from "express";
import { verifyToken, type AuthRequest } from "../middleware/auth.js";
import type { Response } from "express";

const router = Router();

interface SSEClient {
  res: Response;
  userCode: string;
  clientId: string;
}

// In-memory connection registry: tripId → set of connected clients
const connections = new Map<string, Set<SSEClient>>();

// SSE endpoint — uses query param token since EventSource doesn't support headers
router.get("/trip/:tripId", (req: AuthRequest, res) => {
  const token = req.query.token as string;
  if (!token) { res.status(401).json({ error: "Token required" }); return; }
  try {
    req.user = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Invalid token" }); return;
  }

  const tripId = req.params.tripId as string;
  const userCode = req.user!.code;
  const clientId = (req.query.clientId as string) || Math.random().toString(36).slice(2);

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  const client: SSEClient = { res, userCode, clientId };

  if (!connections.has(tripId)) {
    connections.set(tripId, new Set());
  }
  connections.get(tripId)!.add(client);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

  // Heartbeat every 30s to keep Railway connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  // Clean up on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    const clients = connections.get(tripId);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) connections.delete(tripId);
    }
  });
});

export function broadcastChange(
  tripId: string,
  data: { userCode: string; displayName: string; description: string },
) {
  const clients = connections.get(tripId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({
    type: "change",
    userCode: data.userCode,
    displayName: data.displayName,
    description: data.description,
    timestamp: Date.now(),
  });

  for (const client of clients) {
    // Don't send to the user who made the change
    if (client.userCode === data.userCode) continue;
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch {
      // Client disconnected — will be cleaned up on 'close'
    }
  }
}

export default router;
