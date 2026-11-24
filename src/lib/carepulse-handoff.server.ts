import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { HANDOFF_LIFETIME_SECONDS, challengeSchema, trustedOrigins } from "./carepulse-handoff-protocol";

const envelopeSchema = z.object({
  version: z.literal(1), token: z.string().min(1), userId: z.string().uuid(),
  patientId: z.string().uuid(), clinicId: z.string().uuid(),
  audience: z.string().url(), parentOrigin: z.string().url(), challenge: challengeSchema,
  issuedAt: z.number(), expiresAt: z.number(),
}).strict();
export type HandoffEnvelope = z.infer<typeof envelopeSchema>;
const encoder = new TextEncoder();
function encode(bytes: Uint8Array) { return btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")); }
function decode(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function key(secret: string) {
  if (secret.length < 64) throw new Error("Authentication handoff is not configured.");
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealHandoff(envelope: HandoffEnvelope, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), encoder.encode(JSON.stringify(envelopeSchema.parse(envelope))));
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function openHandoff(ticket: string, secret: string, audience: string, origins: string[], now = Date.now()) {
  const [ivPart, dataPart, extra] = ticket.split(".");
  if (!ivPart || !dataPart || extra || ticket.length > 20000) throw new Error("Invalid authentication handoff.");
  const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(ivPart) }, await key(secret), decode(dataPart));
  const envelope = envelopeSchema.parse(JSON.parse(new TextDecoder().decode(decoded)));
  if (envelope.audience !== audience || !origins.includes(envelope.parentOrigin) ||
      envelope.expiresAt <= now || envelope.issuedAt > now ||
      envelope.expiresAt - envelope.issuedAt > HANDOFF_LIFETIME_SECONDS * 1000) {
    throw new Error("Authentication handoff expired or invalid.");
  }
  return envelope;
}

export function userClient(url: string, publicKey: string, token: string) {
  return createClient<Database>(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("apikey", publicKey);
      return fetch(input, { ...init, headers });
    } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function verifiedPatient(client: SupabaseClient<Database>, userId: string) {
  const read = () => client.from("patients").select("id, clinic_id, full_name").eq("auth_user_id", userId).limit(2);
  let result = await read();
  if (result.error) throw new Error("Could not verify your clinic patient record.");
  if (result.data.length === 0) {
    // Reuse the existing secure RPC, never INSERT a patient or accept a clinic from the browser.
    const { error } = await client.rpc("link_patient_account");
    if (error) throw new Error("Your patient account could not be linked. Please contact your clinic.");
    result = await read();
  }
  const patient = result.data?.[0];
  if (result.error || result.data?.length !== 1 || !patient?.clinic_id) throw new Error("A unique linked clinic patient record is required.");
  return { id: patient.id, clinicId: patient.clinic_id, fullName: patient.full_name };
}

export async function issueHandoff(request: Request, config: { origins: string; secret: string; url: string; publicKey: string }) {
  const origins = trustedOrigins(config.origins);
  const origin = request.headers.get("origin") ?? "";
  const cors = { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store" };
  if (!origins.includes(origin)) return Response.json({ error: "This app is not authorised to connect." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  try {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ") || header.length > 16000) return Response.json({ error: "Sign in to connect your patient account." }, { status: 401, headers: cors });
    const { challenge } = z.object({ challenge: challengeSchema }).strict().parse(await request.json());
    const token = header.slice(7);
    const client = userClient(config.url, config.publicKey, token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Patient authentication could not be verified." }, { status: 401, headers: cors });
    const patient = await verifiedPatient(client, data.user.id);
    const { data: claims, error: claimsError } = await client.auth.getClaims(token);
    const tokenExpiry = Number(claims?.claims.exp) * 1000;
    const now = Date.now();
    if (claimsError || !Number.isFinite(tokenExpiry) || tokenExpiry <= now) throw new Error("Expired authentication.");
    const expiresAt = Math.min(now + HANDOFF_LIFETIME_SECONDS * 1000, tokenExpiry);
    const ticket = await sealHandoff({ version: 1, token, userId: data.user.id, patientId: patient.id,
      clinicId: patient.clinicId, audience: new URL(request.url).origin, parentOrigin: origin, challenge,
      issuedAt: now, expiresAt }, config.secret);
    return Response.json({ ticket, expiresAt }, { headers: cors });
  } catch {
    // Deliberately do not log headers, request bodies, provider errors, tokens, or tickets.
    return Response.json({ error: "Could not securely connect your clinic patient account." }, { status: 403, headers: cors });
  }
}