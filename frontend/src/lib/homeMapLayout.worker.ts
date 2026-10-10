/// <reference lib="webworker" />
/**
 * Works out the Home map's layout away from the page, so Home never freezes while it's worked out (Oct 10 re-audit:
 * up to 1 s at a time on an app open). One question in, one layout out, matched by `id`.
 */
import { layoutMap, type LayoutInput } from "./homeMapLayout";

self.onmessage = (e: MessageEvent<{ id: number; input: LayoutInput }>) => {
  try {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: e.data.id, layout: layoutMap(e.data.input) });
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: e.data.id, error: String(err) });
  }
};
