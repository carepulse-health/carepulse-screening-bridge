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

export const EXISTING_ACCOUNT_MESSAGE = "This email already has a CarePulse account, so no new account was created and the password you just entered was not saved. Sign in with your existing password, or choose “Forgot Password?” to set a new one.";

export type RegistrationOutcome =
  | { kind: "error"; message: string }
  | { kind: "existing"; message: string }
  | { kind: "confirm_email"; message: string }
  | { kind: "signed_in" };

export function registrationOutcome({ error, hasSession, identityCount }: SignUpResult): RegistrationOutcome {
  if (error) {
    const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
    // Rate limits must be checked first: their codes/messages also mention "email".
    if (error.status === 429 || text.includes("rate limit") || text.includes("over_email_send")) return { kind: "error", message: "Too many attempts. Please wait a few minutes and try again. No account was created." };
    if (text.includes("already") || text.includes("exists")) return { kind: "existing", message: EXISTING_ACCOUNT_MESSAGE };
    if (text.includes("signup") && text.includes("disabled")) return { kind: "error", message: "New patient accounts can't be created right now. Please contact your clinic." };
    if (text.includes("weak") || text.includes("password")) return { kind: "error", message: "Choose a stronger password and try again." };
    if (text.includes("email")) return { kind: "error", message: "That email address could not be used. Check it and try again." };
    return { kind: "error", message: "Your account could not be created. Please try again." };
  }
  // With email confirmation on, an already-registered email returns a user with no identities.
  if (!hasSession && identityCount === 0) return { kind: "existing", message: EXISTING_ACCOUNT_MESSAGE };
  if (!hasSession) return { kind: "confirm_email", message: "Account created. We've sent you a confirmation email — open the link in it to activate your account. You can't sign in until your email is confirmed. After that, sign in here and we'll connect your clinic patient record." };
  return { kind: "signed_in" };
}

export function isValidEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }

export function resetRequestMessage(error: { message?: string | undefined; status?: number | undefined } | null): { ok: boolean; message: string } {
  if (!error) return { ok: true, message: "If an account exists for this email, a password reset link has been sent. Check your inbox." };
  const text = (error.message ?? "").toLowerCase();
  if (error.status === 429 || text.includes("rate")) return { ok: false, message: "Too many attempts. Please wait a few minutes and try again." };
  return { ok: false, message: "We couldn't send the reset email. Please try again." };
}

type AuthError = { message?: string | undefined; code?: string | undefined; status?: number | undefined } | null;

export type SignInProblem = { message: string; unconfirmed: boolean };

export function signInErrorMessage(error: NonNullable<AuthError>): SignInProblem {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (text.includes("email_not_confirmed") || text.includes("not confirmed")) return { unconfirmed: true, message: "Your email isn't confirmed yet. Open the confirmation link we emailed you, then sign in. You can resend it below." };
  if (error.status === 429 || text.includes("rate limit")) return { unconfirmed: false, message: "Too many sign-in attempts. Please wait a few minutes and try again." };
  if (text.includes("invalid_credentials") || text.includes("invalid login")) return { unconfirmed: false, message: "Incorrect email or password. If this email already had a CarePulse account before you registered, the older password is still the active one — choose “Forgot Password?” to set a new one." };
  return { unconfirmed: false, message: "Sign-in failed. Please try again." };
}

// Email links (confirmation and password reset) must open a page patients can reach.
// Lovable-hosted copies (preview and published) also use the Vercel site.
// from any device. Editor preview and local addresses are not publicly reachable,
// so they fall back to the published CarePulse site on Vercel, which is the address
// registered in Supabase's Site URL and Redirect URL settings.
export const PUBLIC_SITE_URL = "https://carepulse-screening-bridge.vercel.app";

export function authRedirectBase(origin: string): string {
  try {
    const host = new URL(origin).hostname;
    const privateHost = host === "localhost" || host === "127.0.0.1" || host.endsWith(".lovableproject.com") || host.endsWith(".lovable.app")
      || /^(id-preview|preview)--/.test(host) || host.endsWith(".local");
    return privateHost ? PUBLIC_SITE_URL : origin.replace(/\/$/, "");
  } catch { return PUBLIC_SITE_URL; }
}

// Reads Supabase error details from an email link (e.g. an expired reset link).
export function emailLinkError(hash: string, search = ""): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const code = params.get("error_code") ?? query.get("error_code");
  const error = params.get("error") ?? query.get("error");
  if (!code && !error) return null;
  if (code === "otp_expired") return "This link has expired or was already used. Request a new one from Sign in → Forgot Password?.";
  return "This link is not valid. Request a new one from Sign in → Forgot Password?.";
}
