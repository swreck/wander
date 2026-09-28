import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "./api";

// How this device last signed in. Used to decide whether to offer Face ID setup.
const SIGNED_IN_WITH_KEY = "wander:signed-in-with";

export function markSignedInWith(method: "passkey" | "link" | "name") {
  try { localStorage.setItem(SIGNED_IN_WITH_KEY, method); } catch { /* storage unavailable */ }
}

export function signedInWithPasskeyHere(): boolean {
  try { return localStorage.getItem(SIGNED_IN_WITH_KEY) === "passkey"; } catch { return false; }
}

/** True when this device can use Face ID / Touch ID with Wander. */
export async function deviceSupportsPasskeys(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** The person closed the Face ID sheet themselves — not an error worth alarming them about. */
export function isUserCancel(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

/** Sign in with a passkey. Returns the same shape as a normal sign-in. */
export async function signInWithPasskey(): Promise<{ token: string; displayName: string; travelerId?: string; role?: string }> {
  const res = await fetch("/api/auth/passkey/login-options", { method: "POST" });
  if (!res.ok) throw new Error("Couldn't start Face ID. Try again?");
  const { options, challengeToken } = await res.json();
  const response = await startAuthentication({ optionsJSON: options });
  const verify = await fetch("/api/auth/passkey/login-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken, response }),
  });
  const body = await verify.json().catch(() => ({}));
  if (!verify.ok) throw new Error(body.error || "Face ID didn't check out. Try again?");
  return body;
}

/**
 * Send a Face ID failure's real cause to the server log. Many failures happen on the phone
 * alone, so without this the only trace is the message the person saw.
 */
export function reportPasskeyProblem(stage: string, err: unknown) {
  const e = err as { name?: string; code?: string; message?: string };
  fetch("/api/auth/passkey/client-problem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, name: e?.name, code: e?.code, message: e?.message }),
  }).catch(() => { /* reporting must never get in the way */ });
}

/** The phone already holds a Wander key and declined to make a duplicate. */
export function isAlreadyOnDevice(err: unknown): boolean {
  const e = err as { name?: string; code?: string };
  return e?.name === "InvalidStateError" || e?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";
}

// Each function below shows Face ID exactly once. Safari allows a Face ID prompt only right after a
// tap, so every step gets its own button — never two prompts chained from one tap.

/**
 * Add Face ID for the signed-in person on this device.
 * replace: the phone's older Wander key no longer works — make a fresh one in its place.
 * Throws the phone's error; isAlreadyOnDevice(err) means this phone already has a Wander key.
 */
export async function setUpPasskeyOnThisDevice(replace = false): Promise<void> {
  try {
    const { options, challengeToken } = await api.post<{ options: any; challengeToken: string }>("/auth/passkey/register-options", { replace });
    const response = await startRegistration({ optionsJSON: options });
    await api.post("/auth/passkey/register-verify", { challengeToken, response });
  } catch (err) {
    if (!isUserCancel(err) && !isAlreadyOnDevice(err)) reportPasskeyProblem(replace ? "setup-replace" : "setup", err);
    throw err;
  }
  markSignedInWith("passkey");
}

/** Prove the Wander key already on this phone signs in as this person. */
export async function confirmPasskeyOnThisDevice(travelerId?: string): Promise<boolean> {
  try {
    const who = await signInWithPasskey();
    if (travelerId && who.travelerId !== travelerId) {
      reportPasskeyProblem("confirm-existing", { name: "WrongPerson", message: "The key on this phone belongs to someone else" });
      return false;
    }
    markSignedInWith("passkey");
    return true;
  } catch (err) {
    if (isUserCancel(err)) throw err;
    reportPasskeyProblem("confirm-existing", err);
    return false;
  }
}

export async function passkeyCount(): Promise<number> {
  try {
    const { count } = await api.get<{ count: number }>("/auth/passkey/status");
    return count;
  } catch {
    return 0;
  }
}
