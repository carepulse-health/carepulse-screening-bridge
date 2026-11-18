import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { confirmedSubmission, lagosWeek, screeningInput, screeningPayload } from "./screening-workflow";

export const linkPatientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: patients, error } = await context.supabase.from("patients").select("id").eq("auth_user_id", context.userId);
    if (error) return { linked: false, message: "Could not check your patient account. Please try again." };
    if (patients.length === 1) return { linked: true, message: "Your patient account is linked to your clinic." };
    if (patients.length > 1) return { linked: false, message: "More than one patient record is linked. Please contact your clinic." };
    const { error: linkError } = await context.supabase.rpc("link_patient_account");
    if (linkError) return { linked: false, message: "Verify your account email and ask your clinic to register one matching patient record. Your clinic association was not changed." };
    // Re-read ownership instead of trusting a transport-only success.
    const linked = await context.supabase.from("patients").select("id").eq("auth_user_id", context.userId);
    return linked.data?.length === 1 && !linked.error
      ? { linked: true, message: "Your patient account is linked to your clinic." }
      : { linked: false, message: "Patient linking could not be confirmed. Please contact your clinic." };
  });

export const submitScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => screeningInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: patients, error: profileError } = await context.supabase.from("patients").select("id").eq("auth_user_id", context.userId);
    if (profileError) return { state: "failed" as const, message: "Your clinic has not received this screening. Please try again." };
    if (patients.length === 0) {
      const { error } = await context.supabase.rpc("link_patient_account");
      if (error) return { state: "failed" as const, message: "Your clinic has not received this screening. Verify your account email and ask your clinic to link your patient profile." };
    }
    if (patients.length > 1) return { state: "failed" as const, message: "Your clinic has not received this screening. Ask your clinic to resolve multiple linked patient records." };
    const { data: saved, error } = await context.supabase.rpc("submit_carepulse_screening", {
      _submission_id: data.submissionId, _answers: data.answers,
    });
    if (error) {
      const unconfirmed = !error.code || error.code.startsWith("08") || error.code === "57014";
      return { state: unconfirmed ? "unconfirmed" as const : "failed" as const,
        message: unconfirmed ? "We could not confirm delivery. Retry to check safely, or contact your clinic directly." : "Your clinic has not received this screening. Please try again or contact your clinic." };
    }
    if (!confirmedSubmission(saved, data.submissionId)) return { state: "unconfirmed" as const, message: "We could not confirm your screening and clinic notification. Please retry." };
    return { state: "submitted" as const, message: "Your screening has been saved and a clinic notification created. A healthcare professional still needs to review it. No clinical priority has been assigned." };
  });

const clinicInput = z.object({ clinicId: z.string().uuid().optional(), page: z.number().int().min(0).default(0) });
export const getClinicScreenings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => clinicInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: memberships, error: membershipError } = await context.supabase.from("clinic_members").select("clinic_id, role, clinics(name)").eq("user_id", context.userId).in("role", ["admin", "receptionist", "doctor"]);
    if (membershipError) throw new Error("Could not verify clinic access. Please try again.");
    const clinics = (memberships ?? []).map(m => ({ id: m.clinic_id, role: m.role, name: m.clinics?.name ?? "Clinic" }));
    const clinic = clinics.find(c => c.id === data.clinicId) ?? (data.clinicId ? undefined : clinics[0]);
    if (!clinic) return { clinics, clinic: null, records: [], total: 0, weeklyCount: null, reviewReady: false, week: lagosWeek() };
    const { data: records, error, count } = await context.supabase.from("triage_records")
      .select("*, patients(full_name)", { count: "exact" }).eq("clinic_id", clinic.id)
      .order("created_at", { ascending: false }).order("id").range(data.page * 25, data.page * 25 + 24);
    if (error) throw new Error("Could not load received screenings. Please try again.");
    const week = lagosWeek();
    // This optional column is deliberately queried without changing generated types.
    // Until the separately approved migration is applied, review/KPI remain unavailable.
    const { error: timestampError } = await context.supabase.from("triage_records").select("id, reviewed_at").eq("clinic_id", clinic.id).limit(1);
    const reviewReady = !timestampError;
    const weekly = reviewReady ? await context.supabase.from("triage_records")
      .select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id)
      .eq("review_status", "reviewed").not("reviewed_by", "is", null)
      .gte("reviewed_at", week.start).lt("reviewed_at", week.end) : null;
    return { clinics, clinic, records: (records ?? []).map(r => ({
      id: r.id, name: r.patients?.full_name ?? "Patient", summary: r.ai_summary,
      priority: r.priority_level, status: r.review_status, reviewer: r.reviewed_by,
      reviewedAt: z.object({ reviewed_at: z.string().nullable().optional() }).parse(r).reviewed_at ?? null,
      action: r.recommended_action, ...screeningPayload(r.symptoms),
    })), total: count ?? 0, weeklyCount: weekly && !weekly.error ? weekly.count : null, reviewReady, week };
  });

export const saveClinicalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), clinicId: z.string().uuid(), action: z.string().trim().min(1).max(5000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: membership, error } = await context.supabase.from("clinic_members").select("id").eq("user_id", context.userId).eq("clinic_id", data.clinicId).eq("role", "doctor").maybeSingle();
    if (error || !membership) throw new Error("Only an authorised doctor at this clinic can complete clinical review.");
    const { error: readinessError } = await context.supabase.from("triage_records").select("reviewed_at").eq("clinic_id", data.clinicId).limit(1);
    if (readinessError) throw new Error("Secure review recording is awaiting database approval. No review was saved.");
    const { data: updated, error: updateError } = await context.supabase.from("triage_records")
      .update({ review_status: "reviewed", recommended_action: data.action })
      .eq("id", data.id).eq("clinic_id", data.clinicId).in("review_status", ["pending", "pending review"])
      .select("id, reviewed_by, reviewed_at").maybeSingle();
    if (updateError || !updated) throw new Error("The review was not confirmed. Refresh the queue before trying again.");
    const verified = z.object({ id: z.string(), reviewed_by: z.string(), reviewed_at: z.string() }).safeParse(updated);
    if (!verified.success || verified.data.reviewed_by !== context.userId) throw new Error("Review attribution could not be confirmed. Refresh the queue.");
    return { saved: true };
  });