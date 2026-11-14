# CarePulse secure screening completion

## Changes for your approval

Keep the existing interface, tables, and features. Save completed screenings as **Unclassified** with **pending review**, never as a medical urgency decision. Save the healthcare-professional request and all answers in existing fields.

- Only signed-in patients can submit their own screenings, verified through `patients.auth_user_id`.
- Derive patient and clinic IDs inside the database; the browser supplies neither.
- No anonymous access, public policies, service-role browser keys, or additional tables.
- Preserve the existing staff-only read and review policies. Patients do not gain access to other patients’ records.
- Confirm success only from the database response. Separate saved-record confirmation from confirmation that a clinic dashboard notification was created.
- Preserve immediate emergency guidance without assigning an Emergency priority.

## Exact proposed database changes

The two existing allowed-value constraints gain one value each; legacy values remain accepted. A narrow authenticated submission function validates ownership and returns only the submitted record’s reference and status. It does not grant patients unrestricted writes. Staff access continues through the existing clinic-membership policies.

```sql
ALTER TABLE public.triage_records
  DROP CONSTRAINT triage_records_priority_level_check;
ALTER TABLE public.triage_records
  ADD CONSTRAINT triage_records_priority_level_check
  CHECK (priority_level IN ('mild', 'moderate', 'emergency', 'Unclassified'));
ALTER TABLE public.triage_records
  DROP CONSTRAINT triage_records_review_status_check;
ALTER TABLE public.triage_records
  ADD CONSTRAINT triage_records_review_status_check
  CHECK (review_status IN ('pending', 'reviewed', 'pending review'));

-- These grants support the existing staff-only policies; they do not
-- grant patients read or review access. No anonymous privileges are added.
GRANT SELECT, UPDATE ON public.triage_records TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_carepulse_screening(
  _submission_id uuid, _answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_id uuid;
  v_clinic_id uuid;
  v_patient_count integer;
  v_request boolean;
  v_symptoms text;
  v_record public.triage_records%ROWTYPE;
  v_notification_created boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to submit screening';
  END IF;
  IF _submission_id IS NULL OR jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A completed screening is required';
  END IF;
  IF jsonb_array_length(_answers) <> 10 THEN
    RAISE EXCEPTION 'Ten screening answers are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_answers) item
    WHERE jsonb_typeof(item) <> 'string'
      OR length(trim(item #>> '{}')) = 0
      OR length(item #>> '{}') > 2000
  ) THEN RAISE EXCEPTION 'Invalid screening answer'; END IF;
  IF lower(trim(_answers->>9)) NOT IN
    ('yes', 'yes please', 'yes, please', 'no', 'no thanks', 'no, thanks') THEN
    RAISE EXCEPTION 'Please answer Yes or No to the professional request';
  END IF;
  v_request := lower(trim(_answers->>9)) IN ('yes', 'yes please', 'yes, please');
  SELECT count(*) INTO v_patient_count FROM public.patients
    WHERE auth_user_id = auth.uid();
  IF v_patient_count <> 1 THEN
    RAISE EXCEPTION 'A single linked patient profile is required';
  END IF;
  SELECT id, clinic_id INTO v_patient_id, v_clinic_id
    FROM public.patients WHERE auth_user_id = auth.uid();
  v_symptoms := jsonb_build_object(
    'screening_answers', _answers,
    'requested_healthcare_professional', v_request
  )::text;
  INSERT INTO public.triage_records (
    id, clinic_id, patient_id, symptoms, ai_summary,
    priority_level, recommended_action, review_status
  ) VALUES (
    _submission_id, v_clinic_id, v_patient_id, v_symptoms,
    'Structured preliminary screening completed. No AI diagnosis or clinical classification; qualified clinical review required.',
    'Unclassified',
    CASE WHEN v_request THEN
      'Patient requested a healthcare professional. Human clinical review required.'
    ELSE 'Human clinical review required. Patient did not request a healthcare professional.' END,
    'pending review'
  ) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_record FROM public.triage_records WHERE id = _submission_id;
  IF v_record.patient_id IS DISTINCT FROM v_patient_id
    OR v_record.clinic_id IS DISTINCT FROM v_clinic_id
    OR v_record.symptoms IS DISTINCT FROM v_symptoms
    OR v_record.priority_level IS DISTINCT FROM 'Unclassified' THEN
    RAISE EXCEPTION 'Submission reference conflicts with an existing record';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE clinic_id = v_clinic_id AND notification_type = 'triage_alert'
      AND message LIKE '%' || _submission_id::text || '%'
  ) INTO v_notification_created;
  RETURN jsonb_build_object(
    'id', v_record.id, 'submitted_at', v_record.created_at,
    'requested_healthcare_professional', v_request,
    'notification_created', v_notification_created
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_carepulse_screening(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_carepulse_screening(uuid, jsonb) TO authenticated;

-- Preserve the existing notification automation and its failure tracking,
-- but do not label Unclassified screenings as AI clinical classifications.
CREATE OR REPLACE FUNCTION public.carepulse_triage_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run_id uuid; v_emergency boolean; v_unclassified boolean;
BEGIN
  INSERT INTO public.automation_runs
    (clinic_id, workflow_name, status, related_reference, trigger_key)
  VALUES (NEW.clinic_id, 'Triage alert', 'pending', NEW.id::text,
    'triage-submitted:' || NEW.id::text)
  ON CONFLICT (trigger_key) DO NOTHING RETURNING id INTO v_run_id;
  IF v_run_id IS NULL THEN RETURN NEW; END IF;
  v_emergency := lower(trim(NEW.priority_level)) = 'emergency';
  v_unclassified := NEW.priority_level = 'Unclassified';
  BEGIN
    INSERT INTO public.notifications
      (clinic_id, title, message, notification_type, is_read)
    VALUES (NEW.clinic_id,
      CASE WHEN v_unclassified THEN 'Screening awaiting clinical review'
        WHEN v_emergency THEN 'EMERGENCY — review triage now'
        ELSE 'New triage submitted' END,
      CASE WHEN v_unclassified THEN
        'No clinical priority assigned. ' || coalesce(NEW.recommended_action, '')
          || ' Triage record: ' || NEW.id::text
        ELSE 'Priority: ' || NEW.priority_level
          || '. AI-generated classification; clinical judgment is required. Triage record: '
          || NEW.id::text END,
      CASE WHEN v_emergency THEN 'triage_emergency' ELSE 'triage_alert' END, false);
    UPDATE public.automation_runs SET status = 'success', completed_at = now()
      WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.automation_runs SET status = 'failed',
      error_message = SQLSTATE || ': ' || SQLERRM, completed_at = now()
      WHERE id = v_run_id;
  END;
  RETURN NEW;
END;
$$;
```

## Application wiring after approval

Use authenticated server functions with the existing generated client and bearer middleware. Save every completed screening with a stable submission ID to avoid duplicates on retries. Keep the existing completion panel, adding saving, confirmed success, failure, and retry states. Load received screenings in Clinic Review only for signed-in authorised staff, using existing row-level access rules; do not present local samples as received records. Preserve existing review actions and emergency guidance.

## Validation and limitations

Test answer validation, YES/NO request recording, ownership checks, duplicate prevention, Unclassified/pending review values, and separate notification confirmation. Verify the patient completion and clinic review flows using a fictional linked test patient and an authorised staff account only; never inspect real patient records for testing.

This externally connected project does not provide an authenticated browser test session. Full end-to-end validation and whether a fictional test record appears in the database remain unverified until a safe authorised test session is available. No database change or test record has been applied as part of this proposal.
