import { describe, expect, it } from "vitest";
import { completionSubmission, wantsHealthcareProfessional } from "@/lib/screening-submission";

describe("Screening completion requests", () => {
  it("records an explicit YES request without claiming it was submitted", () => {
    expect(completionSubmission([...Array(9).fill("Sample answer"), "YES"])).toEqual({
      requested: true,
      state: "submitting",
    });
  });
  it("does not request submission when the patient answers NO", () => {
    expect(completionSubmission([...Array(9).fill("Sample answer"), "NO"])).toEqual({
      requested: false,
      state: "not_requested",
    });
  });
  it("asks for clarification instead of treating an ambiguous answer as YES", () => {
    expect(wantsHealthcareProfessional("maybe")).toBeNull();
  });
  it("does not submit an incomplete screening", () => {
    expect(completionSubmission(["YES"])).toEqual({ requested: false, state: "not_requested" });
  });
});
