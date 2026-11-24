import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

// Resolve only encrypted short-lived credentials. The existing Supabase middleware
// still verifies the recovered bearer and applies RLS as that patient on every call.
export const resolveCarePulseHandoff = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const ticket = request.headers.get("x-carepulse-handoff");
  if (!ticket) return next({ context: { handoff: null } });
  setResponseHeader("Cache-Control", "no-store");
  try {
    if (request.headers.has("authorization")) throw new Error("Ambiguous authentication.");
    const { openHandoff, userClient, verifiedPatient } = await import("./carepulse-handoff.server");
    const { trustedOrigins } = await import("./carepulse-handoff-protocol");
    const secret = process.env["CAREPULSE_HANDOFF_SECRET"] ?? "";
    const url = process.env["SUPABASE_URL"];
    const publicKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !publicKey) throw new Error("Authentication is not configured.");
    const envelope = await openHandoff(ticket, secret, new URL(request.url).origin, trustedOrigins(process.env["CAREPULSE_PARENT_ORIGINS"]));
    const client = userClient(url, publicKey, envelope.token);
    const { data, error } = await client.auth.getUser(envelope.token);
    if (error || data.user?.id !== envelope.userId) throw new Error("Invalid patient authentication.");
    const patient = await verifiedPatient(client, envelope.userId);
    if (patient.id !== envelope.patientId || patient.clinicId !== envelope.clinicId) throw new Error("Patient clinic association changed.");
    request.headers.set("authorization", `Bearer ${envelope.token}`);
    return next({ context: { handoff: { challenge: envelope.challenge, expiresAt: envelope.expiresAt } } });
  } catch {
    throw new Error("Your secure patient connection expired or could not be verified. Reconnect from the patient app.");
  }
});