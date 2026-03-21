import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
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
import votingRoutes from "./routes/voting.js";
import trainScheduleRoutes from "./routes/trainSchedules.js";
import transitStatusRoutes from "./routes/transitStatus.js";
import interestRoutes from "./routes/interests.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

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
app.use("/api/voting", votingRoutes);
app.use("/api/train-schedules", trainScheduleRoutes);
app.use("/api/transit-status", transitStatusRoutes);
app.use("/api/interests", interestRoutes);

// Serve frontend static files in production
const publicPath = path.join(__dirname, "..", "public");
app.use(express.static(publicPath));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

export { app };

app.listen(PORT, () => {
  console.log(`Wander API running on port ${PORT}`);
});
