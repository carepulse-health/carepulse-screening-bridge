// Pure helpers for patient self-registration. Registration only creates a sign-in
// account; it never inserts patient records. Linking uses the existing
// link_patient_account() function through linkPatientAccount().

export const MIN_PASSWORD_LENGTH = 8;

export type RegistrationCheck = { ok: true } | { ok: false; message: string };

export function checkRegistrationInput(email: string, password: string, confirm: string): RegistrationCheck {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { ok: false, message: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, message: `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (password !== confirm) return { ok: false, message: "The passwords do not match." };
  return { ok: true };
}

type SignUpResult = {
  error: { message?: string | undefined; code?: string | undefined; status?: number | undefined } | null;
  hasSession: boolean;
  identityCount: number | null;
};

export type RegistrationOutcome =
  | { kind: "error"; message: string }
  | { kind: "existing"; message: string }
  | { kind: "confirm_email"; message: string }
  | { kind: "signed_in" };

export function registrationOutcome({ error, hasSession, identityCount }: SignUpResult): RegistrationOutcome {
  if (error) {
    const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
    if (text.includes("already") || text.includes("exists")) return { kind: "existing", message: "An account with this email already exists. Please sign in instead." };
    if (text.includes("weak") || text.includes("password")) return { kind: "error", message: "Choose a stronger password and try again." };
    if (text.includes("email")) return { kind: "error", message: "That email address could not be used. Check it and try again." };
    if (error.status === 429 || text.includes("rate")) return { kind: "error", message: "Too many attempts. Please wait a few minutes and try again." };
    return { kind: "error", message: "Your account could not be created. Please try again." };
  }
  // With email confirmation on, an already-registered email returns a user with no identities.
  if (!hasSession && identityCount === 0) return { kind: "existing", message: "An account with this email already exists. Please sign in instead." };
  if (!hasSession) return { kind: "confirm_email", message: "Account created. Check your email to confirm it, then sign in here and choose “Link patient account” to connect your clinic record." };
  return { kind: "signed_in" };
}
