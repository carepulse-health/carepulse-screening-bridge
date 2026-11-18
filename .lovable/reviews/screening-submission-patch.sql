-- CarePulse screening submission patch
-- STATUS: NOT EXECUTED. Review before running.
-- Purpose: let the chatbot save completed screenings, add the review
-- timestamp, allow the values the chatbot writes, and restrict review
-- completion to authorised doctors of the same clinic.
-- It reuses the existing submit_carepulse_screening() and
-- link_patient_account() functions, the existing tables, and every
-- existing read policy. No tables are created or dropped.

BEGIN;

-- ============================================================
-- 0. PRE-CHECK - stop before any change if a prerequisite is missing
-- ============================================================
DO $precheck$
BEGIN
  IF pg_catalog.to_regclass('public.triage_records') IS NULL
     OR pg_catalog.to_regclass('public.patients') IS NULL
     OR pg_catalog.to_regclass('public.clinic_members') IS NULL
     OR pg_catalog.to_regclass('public.notifications') IS NULL
     OR pg_catalog.to_regclass('public.automation_runs') IS NULL
     OR pg_catalog.to_regclass('public.clinics') IS NULL THEN
    RAISE EXCEPTION 'Required CarePulse tables are missing; aborting without changes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_carepulse_screening'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'link_patient_account'
  ) THEN
    RAISE EXCEPTION 'submit_carepulse_screening() or link_patient_account() is missing; aborting without changes';
  END IF;
END;
$precheck$;

-- ============================================================
-- 1. REVIEW TIMESTAMP
--    Adds the missing column that records when a review was completed.
--    Nullable, so historical records keep an unknown review time rather
--    than a fabricated one.
-- ============================================================
ALTER TABLE public.triage_records
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

COMMENT ON COLUMN public.triage_records.reviewed_at IS
  'Database-assigned time a clinical review was completed; null means never reviewed.';

-- ============================================================
-- 2. ALLOWED SCREENING STATUS AND PRIORITY VALUES
--    The chatbot stores priority_level = 'Unclassified' and
--    review_status = 'pending review'. Those values are replaced into
--    the existing check constraints together with the values already in
--    use, so nothing that is stored today becomes invalid.
--    Existing rows are checked first; the patch aborts instead of
--    silently deleting or altering them.
-- ============================================================
DO $priority$
DECLARE
  r   record;
  bad integer;
BEGIN
  SELECT count(*) INTO bad
    FROM public.triage_records
   WHERE priority_level IS NOT NULL
     AND priority_level NOT IN ('Unclassified', 'mild', 'moderate', 'emergency');
  IF bad > 0 THEN
    RAISE EXCEPTION '% existing screening record(s) use a priority value outside the allowed set; inspect them before applying this patch', bad;
  END IF;

  FOR r IN
    SELECT conname FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.triage_records'::pg_catalog.regclass
       AND contype = 'c'
       AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%priority_level%'
  LOOP
    EXECUTE format('ALTER TABLE public.triage_records DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.triage_records
    ADD CONSTRAINT triage_records_priority_level_check
    CHECK (priority_level IS NULL
           OR priority_level IN ('Unclassified', 'mild', 'moderate', 'emergency'));
END;
$priority$;

DO $status$
DECLARE
  r   record;
  bad integer;
BEGIN
  SELECT count(*) INTO bad
    FROM public.triage_records
   WHERE review_status IS NOT NULL
     AND review_status NOT IN ('pending review', 'pending', 'reviewed');
  IF bad > 0 THEN
    RAISE EXCEPTION '% existing screening record(s) use a review status outside the allowed set; inspect them before applying this patch', bad;
  END IF;

  FOR r IN
    SELECT conname FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.triage_records'::pg_catalog.regclass
       AND contype = 'c'
       AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%review_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.triage_records DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.triage_records
    ADD CONSTRAINT triage_records_review_status_check
    CHECK (review_status IS NULL
           OR review_status IN ('pending review', 'pending', 'reviewed'));
END;
$status$;

-- ============================================================
-- 3. AUTHORISED-DOCTOR REVIEW GUARD
--    One trigger function on the existing table. It runs before every
--    update and:
--      - requires the caller to be a signed-in doctor of the record's clinic
--      - freezes patient identity, clinic association, answers, summary,
--        priority and submission time
--      - allows only pending -> reviewed, never a re-review
--      - assigns reviewed_by and reviewed_at from the database, so a
--        client cannot forge the reviewer or the time
--      - requires a written review action
-- ============================================================
CREATE OR REPLACE FUNCTION public.carepulse_protect_triage_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $guard$
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

  IF (pg_catalog.to_jsonb(NEW)
        - ARRAY['review_status', 'recommended_action', 'reviewed_by', 'reviewed_at'])
     IS DISTINCT FROM
     (pg_catalog.to_jsonb(OLD)
        - ARRAY['review_status', 'recommended_action', 'reviewed_by', 'reviewed_at']) THEN
    RAISE EXCEPTION 'Original screening fields cannot be changed during review'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.review_status IS NOT DISTINCT FROM 'reviewed' THEN
    RAISE EXCEPTION 'Completed clinical reviews are final';
  END IF;

  IF OLD.review_status IS NULL
     OR OLD.review_status NOT IN ('pending', 'pending review')
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
$guard$;

REVOKE ALL ON FUNCTION public.carepulse_protect_triage_review()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS carepulse_protect_triage_review ON public.triage_records;
CREATE TRIGGER carepulse_protect_triage_review
  BEFORE UPDATE ON public.triage_records
  FOR EACH ROW EXECUTE FUNCTION public.carepulse_protect_triage_review();

-- ============================================================
-- 4. REVIEW PERMISSIONS
--    Replaces only review-write policies. Every SELECT policy is left
--    untouched, so patients keep reading their own records and clinic
--    staff keep reading their clinic's records.
--    Write access is then limited to the two columns a reviewer needs;
--    the trigger assigns reviewer and time.
-- ============================================================
DO $policy$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'triage_records'
       AND cmd = 'UPDATE'
       AND policyname <> 'triage_records_clinic_doctor_review'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.triage_records', r.policyname);
    RAISE NOTICE 'Review: removed the previous review-write policy "%"', r.policyname;
  END LOOP;

  FOR r IN
    SELECT policyname FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'triage_records'
       AND cmd = 'ALL'
  LOOP
    RAISE NOTICE 'Review: broad policy "%" left intact; its write ability is now limited by the column grants below', r.policyname;
  END LOOP;
END;
$policy$;

DROP POLICY IF EXISTS triage_records_clinic_doctor_review ON public.triage_records;
CREATE POLICY triage_records_clinic_doctor_review
  ON public.triage_records FOR UPDATE TO authenticated
  USING (
    review_status IN ('pending', 'pending review')
    AND EXISTS (
      SELECT 1 FROM public.clinic_members m
       WHERE m.clinic_id = triage_records.clinic_id
         AND m.user_id = auth.uid()
         AND m.role = 'doctor'
    )
  )
  WITH CHECK (
    review_status = 'reviewed'
    AND reviewed_by = auth.uid()
    AND reviewed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clinic_members m
       WHERE m.clinic_id = triage_records.clinic_id
         AND m.user_id = auth.uid()
         AND m.role = 'doctor'
    )
  );

REVOKE UPDATE ON public.triage_records FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (review_status, reviewed_by, recommended_action, reviewed_at)
  ON public.triage_records FROM PUBLIC, anon, authenticated;
GRANT UPDATE (review_status, recommended_action)
  ON public.triage_records TO authenticated;

-- ============================================================
-- 5. CLINIC NOTIFICATION INTEGRITY
--    A screening must never be saved without its clinic notification.
--    If a notification trigger is already installed it is preserved
--    unchanged. Only when none exists is one created, and it writes the
--    notification and its automation record in the same transaction as
--    the screening - any failure aborts the whole submission.
-- ============================================================
CREATE OR REPLACE FUNCTION public.carepulse_triage_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $notify$
DECLARE
  v_key  text := 'carepulse-triage:' || OLD.id::text;
  v_sent integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.automation_runs a WHERE a.trigger_key = v_key
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.clinic_id = OLD.clinic_id AND n.patient_id = OLD.patient_id
    ) THEN
      RAISE EXCEPTION 'Clinic notification is missing for screening %', OLD.id
        USING ERRCODE = '40001';
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, is_read, clinic_id, patient_id)
  SELECT m.user_id,
         'Screening awaiting clinical review',
         'A patient completed a preliminary screening. No clinical priority has been assigned; qualified clinical review is required.',
         false,
         OLD.clinic_id,
         OLD.patient_id
    FROM public.clinic_members m
   WHERE m.clinic_id = OLD.clinic_id
     AND m.role IN ('admin', 'receptionist', 'doctor');

  GET DIAGNOSTICS v_sent = ROW_COUNT;
  IF v_sent = 0 THEN
    RAISE EXCEPTION 'No authorised clinic staff found to notify for screening %', OLD.id
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.automation_runs (trigger_key, status, clinic_id)
  VALUES (v_key, 'success', OLD.clinic_id)
  ON CONFLICT (trigger_key) DO NOTHING;

  RETURN NEW;
END;
$notify$;

REVOKE ALL ON FUNCTION public.carepulse_triage_submitted()
  FROM PUBLIC, anon, authenticated;

DO $trigger$
DECLARE
  fn oid;
BEGIN
  fn := pg_catalog.to_regprocedure('public.carepulse_triage_submitted()');
  IF fn IS NOT NULL AND EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid = 'public.triage_records'::pg_catalog.regclass
          AND t.tgfoid = fn
          AND NOT t.tgisinternal
          AND t.tgenabled IN ('O', 'A')
     ) THEN
    RAISE NOTICE 'Notification: existing trigger preserved unchanged';
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS carepulse_triage_submitted ON public.triage_records;
  CREATE TRIGGER carepulse_triage_submitted
    AFTER INSERT ON public.triage_records
    FOR EACH ROW EXECUTE FUNCTION public.carepulse_triage_submitted();
  RAISE NOTICE 'Notification: trigger created on triage_records';
END;
$trigger$;

-- ============================================================
-- 6. AUTOMATION RUN TABLE PERMISSIONS
--    Staff may read the delivery log; nobody writes to it directly.
--    Writes happen only inside the trigger above.
-- ============================================================
REVOKE ALL ON public.automation_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.automation_runs TO authenticated;

-- ============================================================
-- 7. RESULT SUMMARY (read-only reporting)
-- ============================================================
DO $report$
BEGIN
  RAISE NOTICE 'reviewed_at column: %',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
       WHERE attrelid = 'public.triage_records'::pg_catalog.regclass
         AND attname = 'reviewed_at' AND NOT attisdropped
    ) THEN 'present' ELSE 'MISSING' END;

  RAISE NOTICE 'priority values allowed: %',
    COALESCE((SELECT pg_catalog.pg_get_constraintdef(oid)
                FROM pg_catalog.pg_constraint
               WHERE conrelid = 'public.triage_records'::pg_catalog.regclass
                 AND conname = 'triage_records_priority_level_check'), 'none');

  RAISE NOTICE 'review statuses allowed: %',
    COALESCE((SELECT pg_catalog.pg_get_constraintdef(oid)
                FROM pg_catalog.pg_constraint
               WHERE conrelid = 'public.triage_records'::pg_catalog.regclass
                 AND conname = 'triage_records_review_status_check'), 'none');

  RAISE NOTICE 'review policies now on triage_records: %',
    COALESCE((SELECT string_agg(policyname || ' [' || cmd || ']', ', ')
                FROM pg_catalog.pg_policies
               WHERE schemaname = 'public' AND tablename = 'triage_records'), 'none');
END;
$report$;

COMMIT;
