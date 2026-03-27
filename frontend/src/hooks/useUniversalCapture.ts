import { useEffect, useCallback, useRef } from "react";
import { useCapture } from "../contexts/CaptureContext";
import { api } from "../lib/api";
import { queueCapture, type QueuedCapture } from "../lib/offlineStore";

/**
 * Universal paste/drop capture hook.
 * Listens for paste and drop events on the document level.
 * Skips when the user is typing in an input, textarea, select, or contentEditable.
 * When offline, queues captures in IndexedDB for replay on reconnect.
 */
export default function useUniversalCapture(tripId: string | undefined, cityId?: string) {
  const capture = useCapture();
  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;
  const cityIdRef = useRef(cityId);
  cityIdRef.current = cityId;

  const isTypingInField = useCallback((): boolean => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if ((el as HTMLElement).contentEditable === "true") return true;
    return false;
  }, []);

  /** Convert a File to an ArrayBuffer for IndexedDB storage */
  async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      file.arrayBuffer().then(resolve).catch(reject);
    });
  }

  const extractAndProcess = useCallback(async (
    text: string | null,
    file: File | null,
    source: "paste" | "drop",
  ) => {
    if (!tripIdRef.current) return;

    capture.startCapture(source, text, file);

    try {
      const formData = new FormData();
      formData.append("tripId", tripIdRef.current);
      if (text) formData.append("text", text);
      if (file) formData.append("image", file);

      const result = await api.upload<any>("/import/universal-extract", formData);

      capture.setExtractionResults({
        items: result.items || [],
        versionMatches: result.versionMatches || [],
        newItemIndices: result.newItemIndices || [],
        sessionId: result.sessionId || null,
        sessionItemCount: result.sessionItemCount || 0,
        defaultCityId: result.defaultCityId || null,
        defaultCityName: result.defaultCityName || null,
      });
    } catch (err: any) {
      // If offline, queue the capture for later
      if (!navigator.onLine || (err instanceof TypeError && err.message.includes("fetch"))) {
        try {
          const entry: QueuedCapture = {
            tripId: tripIdRef.current!,
            source,
            text,
            fileData: file ? await fileToArrayBuffer(file) : null,
            fileName: file?.name || null,
            fileType: file?.type || null,
            cityId: cityIdRef.current || null,
            timestamp: Date.now(),
          };
          await queueCapture(entry);
          capture.showToast("Saved for now — I'll finish when you're back online");
          // Auto-dismiss after 3 seconds
          setTimeout(() => capture.dismissToast(), 3000);
        } catch {
          capture.reset();
        }
      } else {
        capture.reset();
        console.error("Universal capture extraction error:", err);
      }
    }
  }, [capture]);

  // Paste handler
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!tripIdRef.current) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const inTextField = isTypingInField();

      // Image pastes always trigger capture — images can't go into text fields
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            extractAndProcess(null, file, "paste");
            return;
          }
        }
      }

      // Text pastes only trigger capture when NOT in a text field
      if (inTextField) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text && text.trim().length > 20) {
        e.preventDefault();
        extractAndProcess(text.trim(), null, "paste");
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isTypingInField, extractAndProcess]);

  // Drop handler
  useEffect(() => {
    function handleDragOver(e: DragEvent) {
      if (isTypingInField()) return;
      // Only handle file drops, not dnd-kit
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
      }
    }

    function handleDrop(e: DragEvent) {
      if (isTypingInField()) return;
      if (!tripIdRef.current) return;
      if (!e.dataTransfer?.types.includes("Files")) return;

      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) {
        extractAndProcess(null, file, "drop");
      }
    }

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [isTypingInField, extractAndProcess]);

  return capture;
}
