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

import { resetRequestMessage, isValidEmail } from "@/lib/patient-registration";
describe("Password recovery", () => {
  it("reports success only when no error is returned", () => {
    expect(resetRequestMessage(null).ok).toBe(true);
    expect(resetRequestMessage({ message: "boom" }).ok).toBe(false);
  });
  it("explains rate limits", () => {
    expect(resetRequestMessage({ status: 429 }).message).toMatch(/Too many/);
  });
  it("validates the recovery email", () => {
    expect(isValidEmail("ada")).toBe(false);
    expect(isValidEmail(" ada@example.com ")).toBe(true);
  });
});

import { signInErrorMessage, authRedirectBase, emailLinkError, PUBLIC_SITE_URL } from "@/lib/patient-registration";
describe("Patient sign-in and email links", () => {
  it("reports an email rate limit as a rate limit, not a bad email", () => {
    const outcome = registrationOutcome({ error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 }, hasSession: false, identityCount: null });
    expect(outcome.kind).toBe("error");
    expect(outcome.kind === "error" && outcome.message).toMatch(/Too many attempts/);
  });
  it("tells unconfirmed patients to confirm their email instead of blaming the password", () => {
    expect(signInErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed", status: 400 }).unconfirmed).toBe(true);
  });
  it("points wrong-password patients to Forgot Password", () => {
    const problem = signInErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 });
    expect(problem.unconfirmed).toBe(false);
    expect(problem.message).toMatch(/Forgot Password/);
  });
  it("sends email links from the editor preview to the published Vercel site", () => {
    expect(PUBLIC_SITE_URL).toBe("https://carepulse-screening-bridge.vercel.app");
    expect(authRedirectBase("https://id-preview--b5aaae33-9011-41eb-9343-d3f4695a155c.lovable.app")).toBe(PUBLIC_SITE_URL);
    expect(authRedirectBase("http://localhost:8080")).toBe(PUBLIC_SITE_URL);
    expect(authRedirectBase("https://carepulse-screening-bridge.vercel.app")).toBe("https://carepulse-screening-bridge.vercel.app");
  });
  it("explains an expired reset link", () => {
    expect(emailLinkError("#error=access_denied&error_code=otp_expired")).toMatch(/expired/);
    expect(emailLinkError("#access_token=abc&type=recovery")).toBeNull();
  });
});
