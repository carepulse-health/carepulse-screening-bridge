import { z } from "zod";

export const HANDOFF_LIFETIME_SECONDS = 120;
export const challengeSchema = z.string().uuid();
export const ticketMessageSchema = z.object({
  type: z.literal("carepulse:handoff"),
  challenge: challengeSchema,
  ticket: z.string().min(40).max(20000),
}).strict();

export function trustedOrigins(value: string | undefined): string[] {
  return (value ?? "").split(",").map(v => v.trim()).filter(v => {
    try { const url = new URL(v); return url.protocol === "https:" && url.origin === v; }
    catch { return false; }
  });
}

export function acceptsParentMessage(event: Pick<MessageEvent, "origin" | "source">, parent: Window, origins: string[]) {
  return event.source === parent && origins.includes(event.origin) && event.origin !== "null";
}

export type VerifiedPatient = { id: string; clinicId: string; fullName: string };
export function canSubmitPatient(ready: boolean, userId: string | undefined, patient: VerifiedPatient | null | undefined) {
  return ready && Boolean(userId && patient?.id && patient.clinicId);
}

// This store exists only in the iframe's JavaScript realm. No browser storage and no Supabase sessions.
let credential: { ticket: string; expiresAt: number } | null = null;
let embedding = false;
export function setEmbeddedAuth(value: boolean) { embedding = value; }
export function isEmbeddedAuth() { return embedding; }
export function rememberHandoff(ticket: string, expiresAt: number) { credential = { ticket, expiresAt }; }
export function forgetHandoff() { credential = null; }
export function getHandoffTicket(now = Date.now()) {
  if (!credential || credential.expiresAt <= now) { credential = null; return null; }
  return credential.ticket;
}