/**
 * FaceIdSetup — offer Face ID sign-in on this device.
 *
 * "card": a small inline card at the top of Home, shown only when this device signed in
 * some other way (personal link), can use Face ID, and the person hasn't said "Not now".
 * "settings": a permanent section in Settings.
 */

import { useEffect, useState } from "react";
import {
  deviceSupportsPasskeys,
  signedInWithPasskeyHere,
  setUpPasskeyOnThisDevice,
  isUserCancel,
} from "../lib/passkeys";

const DISMISS_KEY = "wander:faceid-card-dismissed";

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

export default function FaceIdSetup({ variant }: { variant: "card" | "settings" }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [readyHere, setReadyHere] = useState(signedInWithPasskeyHere());
  const [dismissed, setDismissed] = useState(readDismissed());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    deviceSupportsPasskeys().then(setSupported);
  }, []);

  async function handleSetUp() {
    setBusy(true);
    setMessage("");
    try {
      await setUpPasskeyOnThisDevice();
      setReadyHere(true);
      setJustFinished(true);
    } catch (err) {
      setMessage(isUserCancel(err) ? "No problem — you can set it up any time." : "That didn't finish. Try again?");
    } finally {
      setBusy(false);
    }
  }

  function handleNotNow() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable */ }
    setDismissed(true);
  }

  if (variant === "card") {
    if (supported !== true || dismissed) return null;
    if (readyHere && !justFinished) return null;
    return (
      <div className="mb-4 p-4 bg-white rounded-xl border border-[#e0d8cc]" role="region" aria-label="Face ID sign-in">
        {justFinished ? (
          <p className="text-sm text-[#3a3128]">Face ID is ready. Next time, just look at your phone.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-[#3a3128]">Use Face ID next time?</p>
            <p className="text-sm text-[#6b5d4a] mt-1">One glance opens Wander on this phone.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSetUp}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Setting up…" : "Set up Face ID"}
              </button>
              <button
                onClick={handleNotNow}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-lg text-sm text-[#8a7a62] hover:text-[#3a3128]"
              >
                Not now
              </button>
            </div>
            {message && <p className="text-sm text-[#8a7a62] mt-2">{message}</p>}
          </>
        )}
      </div>
    );
  }

  // Settings section
  return (
    <section className="border-t border-[#e0d8cc] pt-6">
      <h2 className="text-sm font-medium text-[#3a3128] mb-1">Face ID</h2>
      {supported === false ? (
        <p className="text-xs text-[#8a7a62]">This browser can't use Face ID. Your personal Wander link still signs you in.</p>
      ) : readyHere ? (
        <p className="text-xs text-[#8a7a62]">Face ID signs you in on this phone.</p>
      ) : (
        <>
          <p className="text-xs text-[#8a7a62] mb-3">Sign in with a glance instead of your personal link.</p>
          <button
            onClick={handleSetUp}
            disabled={busy || supported === null}
            className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Setting up…" : "Set up Face ID on this phone"}
          </button>
        </>
      )}
      {message && <p className="text-xs text-[#8a7a62] mt-2">{message}</p>}
    </section>
  );
}
