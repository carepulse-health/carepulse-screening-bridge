# CarePulse screening submission and clinical review

## Goal and KPI

**Goal:** Patients get their symptoms reviewed by a qualified clinician at their clinic.

**KPI:** Number of distinct patient screenings marked reviewed by clinic staff each week. A screening qualifies only after an authorised clinician completes and saves its review; viewing, reception handling, and sample actions do not count.

This is a proposal only. Do not execute migrations, create test records, or change application behaviour until approval. Keep the existing interface, URLs, screening questions, emergency guidance, tables, and unrelated features. No duplicate tables or database functions.

## Verified starting point

The live screening RPC, notification/review triggers, patient update guard, and `link_patient_account()` already exist. Reuse them; do not replay the older SQL. The patient guard blocks non-staff changes to clinic, identity/link, email, and creation fields. Account linking requires a verified email and exactly one matching unlinked patient; execution is authenticated-only. The remaining bypass is direct patient self-registration: the authenticated INSERT grant and `patients_self_register` policy still allow a caller to supply a clinic ID. `reviewed_by` exists; `reviewed_at` does not, and current review policies allow admin/receptionist/doctor updates. The chatbot and Clinic Review still use local samples.

## Step 1 — Secure patient-to-clinic association

**Database changes**
- Preserve the existing patient update guard and account-linking function unchanged; no duplicate protection or enrollment function.
- Present a separate minimal SQL proposal to remove arbitrary patient self-registration while retaining clinic-authorised enrollment of existing patients. Confirm the existing staff enrollment path before removing its access; do not silently delete or relink records.
- Continue deriving patient/clinic IDs within the existing screening RPC.

**Frontend changes**
- Connect sign-in to the existing Supabase project and restore/validate the session. Keep sample conversations usable without representing them as clinic submissions.
- Unlinked accounts use the existing `link_patient_account()` after verified sign-in. Handle already linked, no match, multiple matches, and unverified email without accepting clinic IDs from the patient. No match requires clinic enrollment; no false submission.

## Step 2 — Connect chatbot completion to the existing RPC

**Database changes**
- No new submission function or table. Preserve the existing ten-string validation, Unclassified priority, pending review status, ownership checks, atomic notification requirement, and idempotent UUID handling.

**Frontend changes**
- At completion with a Yes request, call the existing RPC with `_submission_id` set to the stable conversation UUID and `_answers` set to the ten answer strings. Preserve the current No branch: record the response locally without silently changing submission consent behaviour.
- Send neither patient nor clinic IDs from the browser.
- Use the existing completion panel for submitting, confirmed success, failure, and retry states. Prevent duplicate clicks; retries use the same UUID and answers.
- Display success only after a valid database response confirms the matching record ID and `notification_created: true`.
- On an explicit database failure, state that the clinic has not received the screening. For a lost response/timeout, state that delivery is unconfirmed, not definitely absent; resolve through an idempotent retry before claiming success or failure.
- Update outdated messages saying Unclassified cannot be stored. Keep emergency guidance immediately available and never wait for submission to show it.

## Step 3 — Connect Clinic Review to received screenings

**Database changes**
- Reuse `triage_records` and the existing ownership/membership read policies. Keep patient reads restricted to their own records and staff reads restricted to clinics where they hold authorised membership.

**Frontend changes**
- Keep the Clinic Review layout and URL; protect real records with staff sign-in and server-validated membership.
- Replace the received queue’s temporary source with authenticated, clinic-scoped database reads, with pagination, loading, empty, and error states in the existing layout.
- Show stored answers, summary, professional-request flag, Unclassified priority, and actual review status. Parse stored answer payloads safely and preserve display of legacy records.
- Scope multi-clinic staff views to a selected authorised clinic, enforcing access server-side.

## Step 4 — Make clinical review durable and attributable

**Database changes**
- Add one nullable `reviewed_at timestamptz` column to the existing `triage_records` table. Do not fabricate timestamps or reviewer identities for historical records.
- Extend the existing review-protection trigger/function rather than create a duplicate. On the first valid transition to reviewed, require an authenticated doctor belonging to the record’s clinic, and set `reviewed_by = auth.uid()` and `reviewed_at` using database time in the same transaction.
- Preserve admin/receptionist/doctor clinic-scoped viewing and appropriate administrative handling, but only a doctor may complete clinical review. An admin role alone is not evidence of clinical qualification; the clinic must assign doctor membership only to verified clinicians.
- Tighten update policy checks so every role is restricted to its authorised review activity. Do not broaden general table writes or allow modification of patient identity, clinic association, original answers, summary, assigned priority, or creation time.
- Prevent clients from forging review timestamps or overwriting completed review attribution. Repeated completion requests must not change the original review time or double-count a screening. Keep completed reviews final for this scope.

**Frontend changes**
- Save the existing review action to Supabase, refresh the queue only after confirmation, and show failures without marking the item reviewed locally.
- Display the saved reviewer reference and review date/time in the existing details area. Resolve a name only through an already authorised source; do not broaden access to other users’ profiles just to obtain a label.
- Keep reception/admin handling and escalation separate from completed clinical review. Preserve sample escalation as sample-only unless an existing authorised persistent escalation workflow is verified; do not falsely report a real escalation.

## Step 5 — Add the weekly clinical review KPI

**Database changes**
- Count distinct `triage_records.id` where `review_status = reviewed`, `reviewed_by` is present, and `reviewed_at` falls in the selected week, scoped to the authorised clinic.
- Use Monday 00:00 through the following Monday 00:00 in Africa/Lagos, with an inclusive start and exclusive end. This is the proposed reporting convention.
- Use an authenticated exact-count query under RLS; do not download all records or depend on Supabase’s default 1,000-row limit. No KPI table or duplicate database function is needed.
- Add a clinic/review-time index only if needed for measured query performance.

**Frontend changes**
- Add a compact “Reviewed this week” value in the existing Clinic Review summary, without redesigning the page. Update it after a confirmed review and keep it clinic-scoped.
- Show the reporting week and distinguish unavailable counts from zero.

## Step 6 — Verify with fictional data

- Exercise patient submission → staff queue → saved doctor review → weekly count through the UI; confirm the record, answers, notification, attribution, and timestamp in Supabase.
- Test ten-string validation, anonymous/unlinked/ambiguous callers, cross-patient reads, cross-clinic access, forged registration/clinic reassignment, and unauthorised reviews.
- Verify retries/concurrent submissions create one screening and one notification. In an isolated test setup, force notification failure and confirm all associated writes roll back.
- Reject forged reviewer/time values and admin/receptionist-only clinical completion. Repeated completion must not change attribution or double-count.
- Test Lagos week boundaries, counts above 1,000 rows, clinic isolation, and historical/sample exclusions. Run existing regression tests.
- This external Supabase connection does not provide managed authenticated browser testing. Use authorised fictional accounts through sign-in, never request service-role keys, and report any blocked checks honestly.

## Technical implementation and approval boundaries

Use authenticated TanStack server functions, the generated user-scoped Supabase client, existing RPC, and bearer middleware. Do not use service-role access for ordinary submission, queue reads, reviews, or KPI queries. Scope caches by account/clinic and clear private data on identity changes.

Present complete SQL separately before execution. Keep narrow grants, RLS, qualified object references, restricted function execution, and safe search paths. Add only `triage_records.reviewed_at`; reuse existing functions/triggers. Existing notifications mean an in-app record was created, not email/SMS delivery or proof staff read it.

## Completion criteria

A fictional linked patient can submit once, see truthful confirmation, and have the received screening appear only to authorised staff at that clinic. An authorised doctor can save a review with attributable identity and time, and the clinic’s weekly KPI increases exactly once. Security-negative tests pass, existing UI/features remain intact, and the final report states whether each test record and notification actually exists in Supabase.

## Shortest safe path to Thursday, 19 November 2026

1. Tuesday: wire authenticated sign-in/account linking, the existing submission RPC, confirmation/retry states, and the real clinic queue. These need no repeat of existing migrations.
2. In parallel, present a separate small SQL patch for the residual self-registration bypass, `reviewed_at`, and extension of the existing review guard/policy to doctor-only completion with database-assigned reviewer/time. Do not execute it without approval.
3. Wednesday: after SQL approval, connect durable doctor review and the exact weekly clinic-scoped count; test with fictional linked patient and doctor accounts, including access denials and duplicate retries.
4. Thursday: demonstrate the complete saved workflow and verify the database record, notification, review attribution, and KPI. Fix regressions only; no redesign, new AI protocol, voice integration, new alert channels, or duplicate structures.

If SQL approval or authorised fictional test sessions are unavailable, submission/queue wiring can proceed, but secure doctor completion and a trustworthy weekly KPI remain explicitly blocked. Do not substitute browser timestamps or UI-only role checks.
