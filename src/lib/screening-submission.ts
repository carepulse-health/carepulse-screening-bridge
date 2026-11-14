export type SubmissionState = "not_requested" | "submitting" | "submitted" | "failed";

export function wantsHealthcareProfessional(answer: string): boolean | null {
  const normalized = answer.trim().toLowerCase();
  if (["yes", "yes please", "yes, please"].includes(normalized)) return true;
  if (["no", "no thanks", "no, thanks"].includes(normalized)) return false;
  return null;
}

export const submissionUnavailable =
  "Your clinic has not received this screening. CarePulse cannot save an unclassified screening with the current clinic settings. Please contact your clinic directly to request a healthcare professional.";

export function completionSubmission(answers: string[]) {
  if (answers.length !== 10) return { requested: false, state: "not_requested" as SubmissionState };
  const requested = wantsHealthcareProfessional(answers[9] ?? "") === true;
  return {
    requested,
    state: requested ? ("failed" as SubmissionState) : ("not_requested" as SubmissionState),
  };
}
