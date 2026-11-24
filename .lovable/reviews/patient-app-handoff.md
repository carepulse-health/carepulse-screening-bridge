# CarePulse patient-app authentication integration

## Implemented chatbot contract

The iframe does not receive a Supabase access token or refresh token. The parent sends its existing access token only to the chatbot server in the Authorization header of an HTTPS POST. The server verifies it with Supabase, resolves the existing patient using `auth_user_id`, reuses `link_patient_account()` if necessary, and issues an AES-GCM authenticated/encrypted credential valid for at most 120 seconds (and never beyond the underlying Supabase token expiry).

The encrypted credential is bound to the chatbot origin, approved parent origin, current challenge, patient and clinic. It is held only in iframe memory. Each protected call decrypts and verifies its lifetime and rechecks current Supabase identity, patient and clinic before the unchanged Supabase authentication middleware/RLS and screening RPC execute. The original access token cannot be read from the encrypted credential by the iframe.

Credentials are reusable for protected calls within their two-minute lifetime, not advertised as one-time codes. The challenge prevents a stale handshake from being adopted by a new iframe. A stolen encrypted credential is still a short-lived bearer credential, so both sites must avoid XSS, token/ticket logging and unnecessary third-party scripts. Parent logout immediately disconnects the iframe when the bridge is notified; without that signal, the remaining ticket lifetime is bounded by two minutes and Supabase's current user verification.

## Remaining configuration

- Set `CAREPULSE_PARENT_ORIGINS` on the chatbot server to the exact HTTPS Patient Mobile App origin(s), comma-separated. No wildcard or localhost entry is accepted. It currently fails closed until the actual origin is supplied.
- `CAREPULSE_HANDOFF_SECRET` is generated securely in this Lovable project. It is not needed by the parent. For a separately managed Vercel server, provision its own 64-character-or-longer secret in Vercel environment settings; minting and redemption must run on the same deployment. Never put it in a VITE variable or browser code.
- Ensure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on that deployment point to the same existing CarePulse Supabase project as the parent. No service-role key is needed.
- Deploy/publish the chatbot and the parent bridge changes. The parent app's actual files have not been changed because its source/project has not been supplied.

## Parent app wiring

Use `src/lib/carepulse-parent-bridge.ts` in the parent project, with its browser-safe protocol dependency. Call `connectPatientChatbot` after the iframe exists, supplying the exact chatbot origin and a `getAccessToken` callback that reads only `data.session?.access_token` from the parent's existing Supabase client. Its existing client remains the sole owner of refresh-token storage and refresh operations.

```typescript
const bridge = connectPatientChatbot({
  iframe,
  chatbotOrigin: 'https://carepulse-screening-bridge.vercel.app',
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  onError: showPatientConnectionError,
});
```

The adapter validates both the exact chatbot `event.origin` and `event.source === iframe.contentWindow`. It responds to the iframe's random UUID challenge by posting it as JSON to `/api/public/auth-handoff` with the parent access token only in the Authorization header. It posts back only the opaque encrypted ticket and matching challenge, with an exact `targetOrigin`. No credentials belong in iframe URLs, page paths, storage, analytics or logs.

Call `bridge.disconnect()` before sign-out or identity switching; remount the iframe for the next account. Call `bridge.dispose()` when unmounting. Mount this listener before the iframe finishes loading (the iframe also retries readiness). Keep the iframe's real HTTPS origin; a sandbox without `allow-same-origin` creates an opaque `null` origin that is intentionally rejected. Do not disable sandbox/security controls blindly; review the existing iframe integration in the parent project first.

## Database impact and testing boundary

No SQL, tables, policies, triggers or Supabase RPCs are changed. Existing linking/submission protections remain in force. Unit tests use fictional identities and test encryption, tampering, lifetime, origin, audience, message structure, refresh-token rejection and submission eligibility. Real parent login, clinic linking, actual database submission and notification confirmation require the parent source/origin and a signed-in fictional clinic-linked account; they must not be reported as tested until exercised against both deployments.