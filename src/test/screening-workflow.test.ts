import { describe, expect, it } from "vitest";
import { confirmedSubmission, lagosWeek, screeningInput, screeningPayload } from "@/lib/screening-workflow";

const id = "550e8400-e29b-41d4-a716-446655440000";
describe("Secure screening workflow", () => {
  it("requires exactly ten string answers", () => {
    expect(screeningInput.safeParse({ submissionId: id, answers: Array(10).fill("Fictional answer") }).success).toBe(true);
    expect(screeningInput.safeParse({ submissionId: id, answers: Array(9).fill("Fictional answer") }).success).toBe(false);
    expect(screeningInput.safeParse({ submissionId: id, answers: [...Array(9).fill("Answer"), 10] }).success).toBe(false);
  });
  it("requires a UUID submission reference", () => {
    expect(screeningInput.safeParse({ submissionId: "patient", answers: Array(10).fill("Answer") }).success).toBe(false);
  });
  it("confirms both the matching saved reference and notification", () => {
    const result = { id, submitted_at: "2026-11-18T12:00:00Z", notification_created: true };
    expect(confirmedSubmission(result, id)).toBe(true);
    expect(confirmedSubmission({ ...result, notification_created: false }, id)).toBe(false);
    expect(confirmedSubmission(result, "550e8400-e29b-41d4-a716-446655440001")).toBe(false);
  });
  it("reports weeks from Monday midnight in Lagos with an exclusive end", () => {
    expect(lagosWeek(new Date("2026-11-18T12:00:00Z"))).toEqual({ start: "2026-11-15T23:00:00.000Z", end: "2026-11-22T23:00:00.000Z" });
    expect(lagosWeek(new Date("2026-11-22T23:00:00Z")).start).toBe("2026-11-22T23:00:00.000Z");
  });
  it("reads the saved professional request without classifying symptoms", () => {
    expect(screeningPayload(JSON.stringify({ screening_answers: Array(10).fill("Fictional"), requested_healthcare_professional: true }))).toEqual({ answers: Array(10).fill("Fictional"), requested: true });
    expect(screeningPayload("Legacy symptom text")).toEqual({ answers: ["Legacy symptom text"], requested: false });
  });
});