import { describe, expect, it } from "vitest";
import { checkRegistrationInput, registrationOutcome } from "@/lib/patient-registration";

describe("Patient account registration", () => {
  it("rejects mismatched passwords", () => {
    expect(checkRegistrationInput("ada@example.com", "password123", "password124").ok).toBe(false);
  });
  it("rejects passwords shorter than 8 characters", () => {
    expect(checkRegistrationInput("ada@example.com", "short", "short").ok).toBe(false);
  });
  it("accepts a valid email and matching password", () => {
    expect(checkRegistrationInput(" ada@example.com ", "password123", "password123")).toEqual({ ok: true });
  });
  it("asks the patient to confirm their email when no session is returned", () => {
    expect(registrationOutcome({ error: null, hasSession: false, identityCount: 1 }).kind).toBe("confirm_email");
  });
  it("treats an obfuscated existing email as an existing account, not a new one", () => {
    expect(registrationOutcome({ error: null, hasSession: false, identityCount: 0 }).kind).toBe("existing");
  });
  it("reports an already-registered error as an existing account", () => {
    expect(registrationOutcome({ error: { message: "User already registered" }, hasSession: false, identityCount: null }).kind).toBe("existing");
  });
  it("only proceeds to linking when a session exists", () => {
    expect(registrationOutcome({ error: null, hasSession: true, identityCount: 1 })).toEqual({ kind: "signed_in" });
  });
});
