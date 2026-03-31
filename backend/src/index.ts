import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import { seedTravelers } from "./services/seedTravelers.js";
import tripRoutes from "./routes/trips.js";
import cityRoutes from "./routes/cities.js";
import dayRoutes from "./routes/days.js";
import routeSegmentRoutes from "./routes/routeSegments.js";
import experienceRoutes from "./routes/experiences.js";
import accommodationRoutes from "./routes/accommodations.js";
import reservationRoutes from "./routes/reservations.js";
import changeLogRoutes from "./routes/changeLogs.js";
import importRoutes from "./routes/import.js";
import geocodingRoutes from "./routes/geocoding.js";
import captureRoutes from "./routes/capture.js";
import travelTimeRoutes from "./routes/travelTime.js";
import observationRoutes from "./routes/observations.js";
import chatRoutes from "./routes/chat.js";
import travelerDocumentRoutes from "./routes/travelerDocuments.js";
import culturalNotesRoutes from "./routes/culturalNotes.js";

import trainScheduleRoutes from "./routes/trainSchedules.js";
import transitStatusRoutes from "./routes/transitStatus.js";
import interestRoutes from "./routes/interests.js";
import phraseRoutes from "./routes/phrases.js";
import decisionRoutes from "./routes/decisions.js";
import learningRoutes from "./routes/learnings.js";
import approvalRoutes from "./routes/approvals.js";
import restoreRoutes from "./routes/restore.js";
import personalItemRoutes from "./routes/personalItems.js";
import reactionRoutes from "./routes/reactions.js";
import experienceNoteRoutes from "./routes/experienceNotes.js";
import scoutRoutes from "./routes/scout.js";
import activityFeedRoutes from "./routes/activityFeed.js";
import reflectionRoutes from "./routes/reflections.js";
import sseRoutes from "./routes/sse.js";
import travelAdvisoryRoutes from "./routes/travelAdvisory.js";
import vaultRoutes from "./routes/vault.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ── Security ──────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // CSP would block Google Maps — rely on other headers
}));
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? ["https://wander.up.railway.app"]
    : true, // Allow all origins in dev
  credentials: true,
}));

// Rate limiting — strict on login, moderate on API, tight on AI chat
// Disabled during tests (all requests come from 127.0.0.1)
if (!process.env.VITEST) {
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts — try again in a minute" },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Give Scout a moment to catch up" },
  });

  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/join", loginLimiter);
  app.use("/api/chat", chatLimiter);
  app.use("/api", apiLimiter);
}

app.use(express.json({ limit: "10mb" })); // Reduced from 50mb

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/cities", cityRoutes);
app.use("/api/days", dayRoutes);
app.use("/api/route-segments", routeSegmentRoutes);
app.use("/api/experiences", experienceRoutes);
app.use("/api/accommodations", accommodationRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/change-logs", changeLogRoutes);
app.use("/api/import", importRoutes);
app.use("/api/geocoding", geocodingRoutes);
app.use("/api/capture", captureRoutes);
app.use("/api/travel-time", travelTimeRoutes);
app.use("/api/observations", observationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/traveler-documents", travelerDocumentRoutes);
app.use("/api/cultural-notes", culturalNotesRoutes);

app.use("/api/train-schedules", trainScheduleRoutes);
app.use("/api/transit-status", transitStatusRoutes);
app.use("/api/interests", interestRoutes);
app.use("/api/phrases", phraseRoutes);
app.use("/api/decisions", decisionRoutes);
app.use("/api/learnings", learningRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/restore", restoreRoutes);
app.use("/api/personal-items", personalItemRoutes);
app.use("/api/reactions", reactionRoutes);
app.use("/api/experience-notes", experienceNoteRoutes);
app.use("/api/scout", scoutRoutes);
app.use("/api/activity-feed", activityFeedRoutes);
app.use("/api/reflections", reflectionRoutes);
app.use("/api/sse", sseRoutes);
app.use("/api/travel-advisory", travelAdvisoryRoutes);
app.use("/api/vault", vaultRoutes);

// Global error handler for API routes — returns JSON instead of HTML stack traces
app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api error]", err?.message || err);
  const status = err?.status || err?.statusCode || 500;
  // Don't leak internal error details in production
  const message = process.env.NODE_ENV === "production" && status >= 500
    ? "Something went wrong on our end"
    : (err?.message || "Internal server error");
  res.status(status).json({ error: message });
});

// Serve frontend static files in production
const publicPath = path.join(__dirname, "..", "public");
// Hashed assets can be cached forever; index.html must always be fresh
app.use("/assets", express.static(path.join(publicPath, "assets"), { maxAge: "1y", immutable: true }));
app.use(express.static(publicPath, { maxAge: 0 }));
app.get("/{*splat}", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(publicPath, "index.html"));
});

export { app };

app.listen(PORT, async () => {
  console.log(`Wander API running on port ${PORT}`);
  try { await seedTravelers(); } catch (e: any) { console.error("[seed] Error:", e.message); }
});
