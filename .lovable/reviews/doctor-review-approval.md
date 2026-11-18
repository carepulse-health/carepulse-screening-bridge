# Separate SQL approval: secure reviews

**Not executed.** This patch reuses existing tables, patient update protection, account-linking and screening submission functions. It adds only `triage_records.reviewed_at`, extends the existing review guard, restricts review completion to doctors in the same clinic, and removes arbitrary patient self-registration while retaining staff enrollment. Existing records are not deleted or relinked; historical review times remain unknown.

Live checks confirmed the existing RPC and notification trigger, Unclassified/pending review constraints, column-level review grants, clinic-scoped reads and own-patient reads. The remaining issues are the missing review timestamp, admin/receptionist review completion permission, and `patients_self_register` permitting patients to choose a clinic at insertion.

No new tables, functions, submission triggers, or automated medical classifications are introduced. An in-app notification is not email/SMS delivery. Doctor membership must be assigned only to qualified clinicians. Existing completed reviews remain final; retrospective timestamp reconstruction and reopening reviews are outside this patch.

```sql
BEGIN;

-- 1. Pre-check existing structures; do not recreate or replace missing prerequisites.
DO $precheck$
BEGIN
  IF pg_catalog.to_regclass('public.triage_records') IS NULL
     OR pg_catalog.to_regclass('public.patients') IS NULL
     OR pg_catalog.to_regclass('public.clinic_members') IS NULL
     OR pg_catalog.to_regprocedure('public.carepulse_protect_triage_review()') IS NULL
     OR pg_catalog.to_regprocedure('public.guard_patient_updates()') IS NULL
     OR pg_catalog.to_regprocedure('public.link_patient_account()') IS NULL THEN
    RAISE EXCEPTION 'Required existing CarePulse structures are missing; stop and inspect';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.triage_records'::pg_catalog.regclass
      AND tgfoid = 'public.carepulse_protect_triage_review()'::pg_catalog.regprocedure
      AND NOT tgisinternal AND tgenabled IN ('O', 'A')
  ) THEN
    RAISE EXCEPTION 'Existing review-protection trigger is not enabled';
  END IF;
END;
$precheck$;

-- 2. Remove the self-enrollment bypass; retain clinic-authorised staff enrollment.
DROP POLICY IF EXISTS patients_self_register ON public.patients;
CREATE POLICY patients_clinic_staff_register
ON public.patients FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clinic_members m
    WHERE m.clinic_id = patients.clinic_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'receptionist', 'doctor')
  )
);
-- No patient records, account links, existing update guard, or linking RPC are changed.

-- 3. Nullable time preserves historical uncertainty; no fabricated backfill.
ALTER TABLE public.triage_records
  ADD COLUMN reviewed_at timestamp with time zone;

-- 4. Extend the existing trigger function, without creating a duplicate trigger.
CREATE OR REPLACE FUNCTION public.carepulse_protect_triage_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $review_guard$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clinic_members m
    WHERE m.clinic_id = OLD.clinic_id
      AND m.user_id = auth.uid()
      AND m.role = 'doctor'
  ) THEN
    RAISE EXCEPTION 'Only an authorised clinic doctor can save a clinical review'
      USING ERRCODE = '42501';
  END IF;

  -- Protect every original field, including summary, identity and priority.
  IF (pg_catalog.to_jsonb(NEW) - ARRAY['review_status', 'recommended_action', 'reviewed_by', 'reviewed_at'])
     IS DISTINCT FROM
     (pg_catalog.to_jsonb(OLD) - ARRAY['review_status', 'recommended_action', 'reviewed_by', 'reviewed_at']) THEN
    RAISE EXCEPTION 'Original screening fields cannot be changed during review'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.review_status IS NOT DISTINCT FROM 'reviewed' THEN
    RAISE EXCEPTION 'Completed clinical reviews are final';
  END IF;
  IF OLD.review_status IS NULL OR OLD.review_status NOT IN ('pending', 'pending review')
     OR NEW.review_status IS DISTINCT FROM 'reviewed' THEN
    RAISE EXCEPTION 'Only a pending screening can be marked reviewed';
  END IF;
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'Reviewer identity and time must be assigned by the database'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.recommended_action IS NULL
     OR pg_catalog.length(pg_catalog.btrim(NEW.recommended_action)) = 0
     OR pg_catalog.length(NEW.recommended_action) > 5000 THEN
    RAISE EXCEPTION 'A clinical review action of 1 to 5000 characters is required';
  END IF;

  NEW.reviewed_by := auth.uid();
  NEW.reviewed_at := pg_catalog.now();
  RETURN NEW;
END;
$review_guard$;
REVOKE ALL ON FUNCTION public.carepulse_protect_triage_review()
  FROM PUBLIC, anon, authenticated;

-- 5. Preserve existing SELECT policies; replace only general staff review UPDATE.
DROP POLICY IF EXISTS triage_records_clinic_staff_review ON public.triage_records;
CREATE POLICY triage_records_clinic_doctor_review
ON public.triage_records FOR UPDATE TO authenticated
USING (
  review_status IN ('pending', 'pending review')
  AND EXISTS (
    SELECT 1 FROM public.clinic_members m
    WHERE m.clinic_id = triage_records.clinic_id
      AND m.user_id = auth.uid() AND m.role = 'doctor'
  )
)
WITH CHECK (
  review_status = 'reviewed'
  AND reviewed_by = auth.uid()
  AND reviewed_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_members m
    WHERE m.clinic_id = triage_records.clinic_id
      AND m.user_id = auth.uid() AND m.role = 'doctor'
  )
);

-- Revoke table and legacy column UPDATE grants before narrow regranting.
REVOKE UPDATE ON public.triage_records FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (review_status, reviewed_by, recommended_action, reviewed_at)
  ON public.triage_records FROM PUBLIC, anon, authenticated;
GRANT UPDATE (review_status, recommended_action)
  ON public.triage_records TO authenticated;

COMMIT;
```

## Verification still required after approval

Use fictional linked patient and doctor accounts to verify submission, notification, clinic visibility, saved reviewer/time and one weekly count increment. Reject cross-patient/cross-clinic reads, patient enrollment, non-doctor completion, original-field edits, forged attribution and repeated completion. Notification rollback requires an isolated test setup; do not break production notification delivery to simulate failure.

The external Supabase connection does not provide managed authenticated browser sessions. No successful fictional submission or doctor review is claimed before those account-based checks.