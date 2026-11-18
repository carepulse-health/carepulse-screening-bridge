export type SubmissionState = "not_requested" | "submitting" | "submitted" | "failed" | "unconfirmed";

export function wantsHealthcareProfessional(answer: string): boolean | null {
  const normalized = answer.trim().toLowerCase();
  if (["yes", "yes please", "yes, please"].includes(normalized)) return true;
  if (["no", "no thanks", "no, thanks"].includes(normalized)) return false;
  return null;
}

export const submissionUnavailable =
  "Your clinic has not received this screening. Sign in with your clinic-registered account to submit it, or contact your clinic directly.";

export function completionSubmission(answers: string[]) {
  if (answers.length !== 10) return { requested: false, state: "not_requested" as SubmissionState };
  const requested = wantsHealthcareProfessional(answers[9] ?? "") === true;
  return {
    requested,
    state: requested ? ("submitting" as SubmissionState) : ("not_requested" as SubmissionState),
  };
}
