/**
 * FaceIdSetup — offer Face ID sign-in on this device.
 *
 * "card": a small inline card at the top of Home, shown only when this device signed in
 * some other way (personal link), can use Face ID, and the person hasn't said "Not now".
 * "settings": a permanent section in Settings.
 *
 * Steps, one tap each (Safari shows Face ID only right after a tap):
 *   offer    → "Set up Face ID" makes a key on this phone.
 *   existing → this phone already has a Wander key (for example from the vault): "Check Face ID"
 *              proves it signs this person in.
 *   replace  → that older key doesn't work with Wander any more: "Replace it" makes a fresh one.
 */

import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  deviceSupportsPasskeys,
  signedInWithPasskeyHere,
  setUpPasskeyOnThisDevice,
  confirmPasskeyOnThisDevice,
  isAlreadyOnDevice,
  isUserCancel,
} from "../lib/passkeys";

const DISMISS_KEY = "wander:faceid-card-dismissed";

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

type Step = "offer" | "existing" | "replace";

const STEP_TEXT: Record<Step, { title: string; body: string; button: string; busy: string }> = {
  offer: { title: "Use Face ID next time?", body: "One glance opens Wander on this phone.", button: "Set up Face ID", busy: "Setting up…" },
  existing: { title: "This phone already has Face ID for Wander", body: "Tap to check it still signs you in.", button: "Check Face ID", busy: "Checking…" },
  replace: { title: "That older Face ID doesn't work with Wander any more", body: "Tap to replace it with a fresh one.", button: "Replace it", busy: "Replacing…" },
};

export default function FaceIdSetup({ variant }: { variant: "card" | "settings" }) {
  const { user } = useAuth();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [readyHere, setReadyHere] = useState(signedInWithPasskeyHere());
  const [dismissed, setDismissed] = useState(readDismissed());
  const [step, setStep] = useState<Step>("offer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    deviceSupportsPasskeys().then(setSupported);
  }, []);

  function finished() {
    setReadyHere(true);
    setJustFinished(true);
  }

  async function handleTap() {
    setBusy(true);
    setMessage("");
    try {
      if (step === "existing") {
        if (await confirmPasskeyOnThisDevice(user?.travelerId)) finished();
        else setStep("replace");
      } else {
        await setUpPasskeyOnThisDevice(step === "replace");
        finished();
      }
    } catch (err) {
      if (isUserCancel(err)) setMessage("No problem — you can set it up any time.");
      else if (isAlreadyOnDevice(err)) setStep("existing");
      else setMessage("That didn't finish. Try again?");
    } finally {
      setBusy(false);
    }
  }

  function handleNotNow() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable */ }
    setDismissed(true);
  }

  const text = STEP_TEXT[step];

  if (variant === "card") {
    if (supported !== true || dismissed) return null;
    if (readyHere && !justFinished) return null;
    return (
      <div className="mb-4 p-4 bg-white rounded-xl border border-[#e0d8cc]" role="region" aria-label="Face ID sign-in">
        {justFinished ? (
          <p className="text-sm text-[#3a3128]">Face ID is ready. Next time, just look at your phone.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-[#3a3128]">{text.title}</p>
            <p className="text-sm text-[#6b5d4a] mt-1">{text.body}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleTap}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? text.busy : text.button}
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
          <p className="text-xs text-[#8a7a62] mb-3">
            {step === "offer" ? "Sign in with a glance instead of your personal link." : `${text.title}. ${text.body}`}
          </p>
          <button
            onClick={handleTap}
            disabled={busy || supported === null}
            className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? text.busy : step === "offer" ? "Set up Face ID on this phone" : text.button}
          </button>
        </>
      )}
      {message && <p className="text-xs text-[#8a7a62] mt-2">{message}</p>}
    </section>
  );
}
