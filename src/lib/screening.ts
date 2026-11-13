export const screeningQuestions = [
  "What is your main health concern?",
  "When did the symptoms begin?",
  "How would you describe your symptoms?",
  "Are your symptoms getting better, worsening, or staying the same?",
  "Have you experienced this problem before?",
  "Are you currently taking any medication?",
  "Do you have any known allergies?",
  "Do you have an existing medical condition?",
  "Have you experienced any other symptoms alongside your main concern?",
  "Would you like to speak with a healthcare professional?",
] as const;

export type ScreeningOutcome = "Emergency" | "Needs review";
export function screeningStep(answerCount: number, emergencyRequested: boolean) {
  if (emergencyRequested)
    return { outcome: "Emergency" as ScreeningOutcome, question: null, finished: true };
  if (answerCount >= screeningQuestions.length)
    return { outcome: "Needs review" as ScreeningOutcome, question: null, finished: true };
  return { outcome: null, question: screeningQuestions[answerCount], finished: false };
}

export const emergencyGuidance =
  "Seek immediate emergency medical attention. Contact local emergency services or go to the nearest emergency department. Do not wait for a clinic reply. This sample screening cannot contact clinic staff.";
