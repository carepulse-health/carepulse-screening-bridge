import { describe, expect, it } from "vitest";
import { screeningQuestions, screeningStep } from "../lib/screening";

describe("CarePulse screening safety", () => {
  it("stops questions immediately when emergency help is requested", () => {
    expect(screeningStep(1, true)).toEqual({
      outcome: "Emergency",
      question: null,
      finished: true,
    });
  });
  it("requires human review rather than clearing a completed unvalidated screening", () => {
    expect(screeningStep(10, false).outcome).toBe("Needs review");
  });
  it("collects the ten requested screening answers", () => {
    expect(screeningQuestions).toHaveLength(10);
    expect(screeningStep(0, false).question).toBe("What is your main health concern?");
    expect(screeningStep(9, false).question).toBe(
      "Would you like to speak with a healthcare professional?",
    );
  });
});
