/**
 * Passkeys (Face ID / Touch ID) — shared by sign-in and the personal vault.
 *
 * One credential per device, stored on the Traveler as JSON:
 *   { id: base64url, publicKey: base64url, counter, transports, createdAt }
 *
 * Credentials saved by the first vault implementation stored the id as an array of
 * single characters and the public key as an array of byte values. normalizeCredentials()
 * reads both shapes, so existing Face ID setups keep working without re-registering.
 *
 * Challenges travel as short-lived signed tokens instead of being stored per traveler,
 * so sign-in can start before we know who is signing in (discoverable passkeys).
 */

import jwt from "jsonwebtoken";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import prisma from "./db.js";

export const RP_NAME = "Wander";
export const RP_ID = process.env.WEBAUTHN_RP_ID
  || (process.env.NODE_ENV === "production" ? "wander.up.railway.app" : "localhost");
export const EXPECTED_ORIGINS = (process.env.WEBAUTHN_ORIGINS
  || (process.env.NODE_ENV === "production" ? "https://wander.up.railway.app" : "http://localhost:5173,http://localhost:3001"))
  .split(",").map((o) => o.trim()).filter(Boolean);

const CHALLENGE_SECRET = process.env.JWT_SECRET || "dev-secret";

export interface StoredCredential {
  id: string;              // base64url credential ID
  publicKey: string;       // base64url COSE public key
  counter: number;
  transports: AuthenticatorTransportFuture[];
  createdAt?: string;
  lastUsedAt?: string;
}

/** Read credentials in the current shape or the legacy vault shape. */
export function normalizeCredentials(raw: unknown): StoredCredential[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredCredential[] = [];
  for (const c of raw as any[]) {
    if (!c) continue;
    const id = typeof c.id === "string" ? c.id
      : Array.isArray(c.credentialID) && c.credentialID.every((x: unknown) => typeof x === "string") ? c.credentialID.join("")
      : typeof c.credentialID === "string" ? c.credentialID
      : null;
    const publicKey = typeof c.publicKey === "string" ? c.publicKey
      : Array.isArray(c.publicKey) ? Buffer.from(c.publicKey as number[]).toString("base64url")
      : null;
    if (!id || !publicKey) continue;
    out.push({
      id,
      publicKey,
      counter: typeof c.counter === "number" ? c.counter : 0,
      transports: Array.isArray(c.transports) ? c.transports : [],
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    });
  }
  return out;
}

export function publicKeyBytes(cred: StoredCredential): Uint8Array<ArrayBuffer> {
  const decoded = Buffer.from(cred.publicKey, "base64url");
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  bytes.set(decoded);
  return bytes;
}

/** A challenge bound to a purpose (and, for signed-in flows, to one traveler). */
export function signChallenge(challenge: string, purpose: "login" | "register" | "vault", travelerId?: string): string {
  return jwt.sign({ challenge, purpose, travelerId }, CHALLENGE_SECRET, { expiresIn: "5m" });
}

export function readChallenge(token: string, purpose: "login" | "register" | "vault", travelerId?: string): string {
  const payload = jwt.verify(token, CHALLENGE_SECRET) as any;
  if (payload.purpose !== purpose) throw new Error("Wrong challenge purpose");
  if (travelerId && payload.travelerId !== travelerId) throw new Error("Challenge belongs to someone else");
  return payload.challenge as string;
}

/** Find which traveler owns a credential ID (for sign-in, where we don't know who it is yet). */
export async function findTravelerByCredentialId(credentialId: string) {
  // A small, trusted group — scanning every traveler is simpler and safer than a JSON-path query.
  const travelers = await prisma.traveler.findMany({
    select: { id: true, displayName: true, webauthnCredentials: true },
  });
  for (const t of travelers) {
    const creds = normalizeCredentials(t.webauthnCredentials);
    const cred = creds.find((c) => c.id === credentialId);
    if (cred) return { traveler: t, creds, cred };
  }
  return null;
}

/**
 * A personal link has done its job once its person has Face ID working — a key set up, or an existing
 * key used, after the link was made. From then on Face ID is the way in; a planner can send a new link.
 */
export async function isLinkRetired(travelerId: string | null | undefined, linkCreatedAt: Date): Promise<boolean> {
  if (!travelerId) return false;
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { webauthnCredentials: true } });
  return normalizeCredentials(t?.webauthnCredentials).some((c) =>
    [c.createdAt, c.lastUsedAt].some((when) => when && new Date(when) > linkCreatedAt));
}

/** Save a credential's new signature counter and when it was used (and migrate legacy-shaped credentials in the same write). */
export async function saveCounter(travelerId: string, creds: StoredCredential[], credentialId: string, newCounter: number) {
  const updated = creds.map((c) => (c.id === credentialId ? { ...c, counter: newCounter, lastUsedAt: new Date().toISOString() } : c));
  await prisma.traveler.update({
    where: { id: travelerId },
    data: { webauthnCredentials: updated as any },
  });
}
