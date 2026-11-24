// @vitest-environment node
import { webcrypto } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openHandoff, sealHandoff, type HandoffEnvelope } from "@/lib/carepulse-handoff.server";
import { acceptsParentMessage, canSubmitPatient, forgetHandoff, getHandoffTicket, rememberHandoff, ticketMessageSchema, trustedOrigins } from "@/lib/carepulse-handoff-protocol";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterEach(forgetHandoff);
const secret = "test-only-encryption-material-".repeat(4);
const envelope: HandoffEnvelope = {
  version: 1, token: "fictional-access-token", userId: "00000000-0000-4000-8000-000000000001",
  patientId: "00000000-0000-4000-8000-000000000002", clinicId: "00000000-0000-4000-8000-000000000003",
  audience: "https://chatbot.example.test", parentOrigin: "https://mobile.example.test",
  challenge: "00000000-0000-4000-8000-000000000004", issuedAt: 1000, expiresAt: 121000,
};
describe("encrypted patient handoff", () => {
  it("encrypts rather than exposing the Supabase bearer", async () => {
    const ticket = await sealHandoff(envelope, secret);
    expect(ticket).not.toContain(envelope.token);
    expect(await openHandoff(ticket, secret, envelope.audience, [envelope.parentOrigin], 1001)).toEqual(envelope);
  });
  it("rejects a modified ticket", async () => {
    const ticket = await sealHandoff(envelope, secret);
    await expect(openHandoff(ticket.slice(0, -8) + "AAAAAAAA", secret, envelope.audience, [envelope.parentOrigin], 1001)).rejects.toThrow();
  });
  it("rejects expired credentials on the server", async () => {
    const ticket = await sealHandoff(envelope, secret);
    await expect(openHandoff(ticket, secret, envelope.audience, [envelope.parentOrigin], 121000)).rejects.toThrow();
  });
  it("rejects tickets with more than two minutes of authority", async () => {
    const ticket = await sealHandoff({ ...envelope, expiresAt: 121001 }, secret);
    await expect(openHandoff(ticket, secret, envelope.audience, [envelope.parentOrigin], 1001)).rejects.toThrow();
  });
  it("rejects another chatbot audience", async () => {
    const ticket = await sealHandoff(envelope, secret);
    await expect(openHandoff(ticket, secret, "https://other.example.test", [envelope.parentOrigin], 1001)).rejects.toThrow();
  });
  it("rejects a removed or unapproved parent origin", async () => {
    const ticket = await sealHandoff(envelope, secret);
    await expect(openHandoff(ticket, secret, envelope.audience, [], 1001)).rejects.toThrow();
  });
  it("accepts messages only from the exact parent window and origin", () => {
    const parent = {} as Window;
    expect(acceptsParentMessage({ source: parent, origin: envelope.parentOrigin }, parent, [envelope.parentOrigin])).toBe(true);
    expect(acceptsParentMessage({ source: {} as Window, origin: envelope.parentOrigin }, parent, [envelope.parentOrigin])).toBe(false);
    expect(acceptsParentMessage({ source: parent, origin: "https://evil.example.test" }, parent, [envelope.parentOrigin])).toBe(false);
    expect(acceptsParentMessage({ source: parent, origin: "null" }, parent, ["null"])).toBe(false);
  });
  it("rejects refresh tokens or raw access tokens in message payloads", () => {
    const message = { type: "carepulse:handoff", challenge: envelope.challenge, ticket: "opaque".repeat(10) };
    expect(ticketMessageSchema.safeParse(message).success).toBe(true);
    expect(ticketMessageSchema.safeParse({ ...message, refresh_token: "must-not-arrive" }).success).toBe(false);
    expect(ticketMessageSchema.safeParse({ ...message, accessToken: "must-not-arrive" }).success).toBe(false);
  });
  it("allows only exact HTTPS origins, not wildcards, paths or opaque origins", () => {
    expect(trustedOrigins("https://mobile.example.test,*,null,http://mobile.example.test,https://mobile.example.test/path")).toEqual(["https://mobile.example.test"]);
  });
  it("drops the in-memory credential when it expires", () => {
    rememberHandoff("fictional-ticket", 2000);
    expect(getHandoffTicket(1999)).toBe("fictional-ticket");
    expect(getHandoffTicket(2000)).toBeNull();
  });
  it("requires verified authentication and a linked clinic before submission", () => {
    const patient = { id: envelope.patientId, clinicId: envelope.clinicId, fullName: "Fictional Patient" };
    expect(canSubmitPatient(true, envelope.userId, patient)).toBe(true);
    expect(canSubmitPatient(false, envelope.userId, patient)).toBe(false);
    expect(canSubmitPatient(true, undefined, patient)).toBe(false);
    expect(canSubmitPatient(true, envelope.userId, null)).toBe(false);
    expect(canSubmitPatient(true, envelope.userId, { ...patient, clinicId: "" })).toBe(false);
  });
});