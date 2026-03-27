import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type CaptureSource = "paste" | "drop" | "camera" | "chat" | "import";

export interface CaptureItem {
  name: string;
  description: string | null;
  userNotes: string | null;
  cityName: string | null;
  themes: string[];
  timeWindow: string | null;
  // user edits
  cityId?: string;
  dayId?: string;
  destination?: "plan" | "maybe" | "decide";
}

export interface VersionMatch {
  existingId: string;
  existingName: string;
  incomingName: string;
  confidence: "high" | "medium";
  diffs: { field: string; existing: string | null; incoming: string | null }[];
}

interface CaptureState {
  // Is the capture flow active?
  active: boolean;
  // Source of the capture
  source: CaptureSource | null;
  // Raw content (text or data URL for images)
  rawContent: string | null;
  rawFile: File | null;
  // Extraction state
  extracting: boolean;
  // Extracted items (after AI processing)
  items: CaptureItem[];
  // Version matches (existing experiences that match)
  versionMatches: VersionMatch[];
  // New item indices (items not matching existing)
  newItemIndices: number[];
  // Multi-page session
  sessionId: string | null;
  sessionItemCount: number;
  // Default context
  defaultCityId: string | null;
  defaultCityName: string | null;
  // Review panel open
  reviewOpen: boolean;
  // Toast state
  toastVisible: boolean;
  toastMessage: string;
}

interface CaptureActions {
  // Start a capture from raw content
  startCapture: (source: CaptureSource, content: string | null, file: File | null) => void;
  // Set extraction results
  setExtractionResults: (results: {
    items: CaptureItem[];
    versionMatches: VersionMatch[];
    newItemIndices: number[];
    sessionId: string | null;
    sessionItemCount: number;
    defaultCityId: string | null;
    defaultCityName: string | null;
  }) => void;
  // Open the review panel (user tapped the toast)
  openReview: () => void;
  // Close/reset everything
  reset: () => void;
  // Show toast
  showToast: (message: string) => void;
  // Dismiss toast
  dismissToast: () => void;
  // Update extracting state
  setExtracting: (v: boolean) => void;
  // Update items after user edits
  updateItems: (items: CaptureItem[]) => void;
}

type CaptureContextType = CaptureState & CaptureActions;

const CaptureContext = createContext<CaptureContextType | null>(null);

const initialState: CaptureState = {
  active: false,
  source: null,
  rawContent: null,
  rawFile: null,
  extracting: false,
  items: [],
  versionMatches: [],
  newItemIndices: [],
  sessionId: null,
  sessionItemCount: 0,
  defaultCityId: null,
  defaultCityName: null,
  reviewOpen: false,
  toastVisible: false,
  toastMessage: "",
};

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CaptureState>(initialState);

  const startCapture = useCallback((source: CaptureSource, content: string | null, file: File | null) => {
    setState(prev => ({
      ...prev,
      active: true,
      source,
      rawContent: content,
      rawFile: file,
      extracting: true,
      toastVisible: true,
      toastMessage: file ? "Processing image..." : "Processing...",
    }));
  }, []);

  const setExtractionResults = useCallback((results: {
    items: CaptureItem[];
    versionMatches: VersionMatch[];
    newItemIndices: number[];
    sessionId: string | null;
    sessionItemCount: number;
    defaultCityId: string | null;
    defaultCityName: string | null;
  }) => {
    setState(prev => ({
      ...prev,
      extracting: false,
      items: results.items,
      versionMatches: results.versionMatches,
      newItemIndices: results.newItemIndices,
      sessionId: results.sessionId,
      sessionItemCount: results.sessionItemCount,
      defaultCityId: results.defaultCityId,
      defaultCityName: results.defaultCityName,
      toastMessage: results.items.length === 1
        ? `Found: ${results.items[0].name}`
        : `Found ${results.items.length} activities`,
    }));
  }, []);

  const openReview = useCallback(() => {
    setState(prev => ({ ...prev, reviewOpen: true, toastVisible: false }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const showToast = useCallback((message: string) => {
    setState(prev => ({ ...prev, toastVisible: true, toastMessage: message }));
  }, []);

  const dismissToast = useCallback(() => {
    setState(prev => ({ ...prev, toastVisible: false }));
  }, []);

  const setExtracting = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, extracting: v }));
  }, []);

  const updateItems = useCallback((items: CaptureItem[]) => {
    setState(prev => ({ ...prev, items }));
  }, []);

  return (
    <CaptureContext.Provider value={{
      ...state,
      startCapture,
      setExtractionResults,
      openReview,
      reset,
      showToast,
      dismissToast,
      setExtracting,
      updateItems,
    }}>
      {children}
    </CaptureContext.Provider>
  );
}

export function useCapture(): CaptureContextType {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used within CaptureProvider");
  return ctx;
}
