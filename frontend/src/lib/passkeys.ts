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

/** Add a passkey for the signed-in person on this device. */
export async function setUpPasskeyOnThisDevice(): Promise<void> {
  const { options, challengeToken } = await api.post<{ options: any; challengeToken: string }>("/auth/passkey/register-options", {});
  const response = await startRegistration({ optionsJSON: options });
  await api.post("/auth/passkey/register-verify", { challengeToken, response });
  markSignedInWith("passkey");
}

export async function passkeyCount(): Promise<number> {
  try {
    const { count } = await api.get<{ count: number }>("/auth/passkey/status");
    return count;
  } catch {
    return 0;
  }
}
