import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCarePulseHandoff } from "./carepulse-handoff-middleware";
import { trustedOrigins } from "./carepulse-handoff-protocol";

export const getHandoffOrigins = createServerFn({ method: "GET" }).handler(() => {
  setResponseHeader("Cache-Control", "no-store");
  return trustedOrigins(process.env["CAREPULSE_PARENT_ORIGINS"]);
});

export const verifyPatientIdentity = createServerFn({ method: "POST" })
  .middleware([resolveCarePulseHandoff, requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { data, error } = await context.supabase.auth.getUser();
    if (error || data.user?.id !== context.userId) throw new Error("Patient authentication could not be verified.");
    const membership = await context.supabase.from("clinic_members").select("id").eq("user_id", context.userId).limit(1);
    if (membership.error) throw new Error("Account permissions could not be verified.");
    if (membership.data.length) return { user: data.user, patient: null, handoff: context.handoff };
    const { verifiedPatient } = await import("./carepulse-handoff.server");
    const patient = await verifiedPatient(context.supabase, context.userId);
    return { user: data.user, patient, handoff: context.handoff };
  });