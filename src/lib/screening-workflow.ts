import { z } from "zod";

export const screeningInput = z.object({
  submissionId: z.string().uuid(),
  answers: z.array(z.string().trim().min(1).max(2000)).length(10),
});
export function confirmedSubmission(value: unknown, id: string) {
  const result = z.object({
    id: z.string().uuid(), submitted_at: z.string(), notification_created: z.literal(true),
  }).safeParse(value);
  return result.success && result.data.id === id;
}
export function lagosWeek(now = new Date()) {
  const local = new Date(now.getTime() + 60 * 60 * 1000);
  const weekday = (local.getUTCDay() + 6) % 7;
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - weekday) - 60 * 60 * 1000;
  return { start: new Date(start).toISOString(), end: new Date(start + 7 * 86400000).toISOString() };
}
export function screeningPayload(symptoms: string | null) {
  try {
    const result = z.object({ screening_answers: z.array(z.string()), requested_healthcare_professional: z.boolean() }).safeParse(JSON.parse(symptoms ?? ""));
    if (result.success) return { answers: result.data.screening_answers, requested: result.data.requested_healthcare_professional };
  } catch { /* Legacy text remains visible without interpreting it. */ }
  return { answers: symptoms ? [symptoms] : [], requested: false };
}