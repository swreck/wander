import { Router } from "express";
import multer from "multer";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { extractFromText, extractFromImage, extractFromUrl, enrichExperience } from "../services/capture.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Capture from text, URL, or image
router.post("/", upload.single("image"), async (req: AuthRequest, res) => {
  try {
    const { tripId, cityId, text, url, name, description, userNotes, mode } = req.body;
    const file = req.file;

    if (!tripId || !cityId) {
      res.status(400).json({ error: "tripId and cityId are required" });
      return;
    }

    // Manual entry — fastest path
    if (name) {
      const exp = await prisma.experience.create({
        data: {
          tripId,
          cityId,
          name,
          description: description || null,
          sourceUrl: url || null,
          sourceText: text || null,
          userNotes: userNotes || null,
          createdBy: req.user!.code,
          state: "possible",
          locationStatus: "unlocated",
        },
        include: { city: true, ratings: true },
      });

      await logChange({
        user: req.user!,
        tripId,
        actionType: "experience_created",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${req.user!.displayName} added "${exp.name}" to ${exp.city.name}`,
        newState: exp,
      });

      // Async enrichment (don't await — capture is instant)
      enrichExperience(exp.id).catch(() => {});

      res.status(201).json({ experiences: [exp], isList: false });
      return;
    }

    // AI extraction path
    let extraction;
    if (file) {
      extraction = await extractFromImage(file.buffer.toString("base64"), file.mimetype);
    } else if (url) {
      extraction = await extractFromUrl(url);
    } else if (text) {
      extraction = await extractFromText(text);
    } else {
      res.status(400).json({ error: "Provide name, text, url, or image" });
      return;
    }

    // If mode is "preview", return extraction without saving
    if (mode === "preview") {
      res.json(extraction);
      return;
    }

    // mode === "all" (create one per item) or single item
    const createAll = mode === "all" || !extraction.isList;

    const city = await prisma.city.findUnique({ where: { id: cityId } });
    const cityName = city?.name || "";

    if (createAll) {
      const created = [];
      for (const item of extraction.experiences) {
        const exp = await prisma.experience.create({
          data: {
            tripId,
            cityId,
            name: item.name,
            description: item.description || null,
            sourceUrl: url || item.sourceUrl || null,
            sourceText: text || null,
            userNotes: userNotes || null,
            createdBy: req.user!.code,
            state: "possible",
            locationStatus: "unlocated",
          },
          include: { city: true, ratings: true },
        });

        await logChange({
          user: req.user!,
          tripId,
          actionType: "experience_created",
          entityType: "experience",
          entityId: exp.id,
          entityName: exp.name,
          description: `${req.user!.displayName} added "${exp.name}" to ${cityName}`,
          newState: exp,
        });

        enrichExperience(exp.id).catch(() => {});
        created.push(exp);
      }

      res.status(201).json({ experiences: created, isList: extraction.isList });
    } else {
      // Keep as one entry
      const combined = extraction.experiences.map((e) => e.name).join(", ");
      const desc = extraction.experiences.map((e) => `${e.name}: ${e.description}`).join("\n");

      const exp = await prisma.experience.create({
        data: {
          tripId,
          cityId,
          name: combined.slice(0, 200),
          description: desc,
          sourceUrl: url || null,
          sourceText: text || null,
          userNotes: userNotes || null,
          createdBy: req.user!.code,
          state: "possible",
          locationStatus: "unlocated",
        },
        include: { city: true, ratings: true },
      });

      await logChange({
        user: req.user!,
        tripId,
        actionType: "experience_created",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${req.user!.displayName} added "${exp.name}" to ${cityName}`,
        newState: exp,
      });

      res.status(201).json({ experiences: [exp], isList: false });
    }
  } catch (err: any) {
    console.error("Capture error:", err);
    res.status(500).json({ error: err.message || "Capture failed" });
  }
});

export default router;
