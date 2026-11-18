import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { CarePulseShell } from "@/components/carepulse-shell";
import { useCarePulseSession } from "@/lib/carepulse-session-context";
import { Button } from "@/components/ui/button";
import { CarePulseClinicQueue } from "@/components/carepulse-clinic-queue";
import { useCarePulseAuth } from "@/lib/carepulse-auth-context";

export const Route = createFileRoute("/clinic")({
  head: () => ({
    meta: [
      { title: "Clinic review | CarePulse" },
      {
        name: "description",
        content:
          "CarePulse clinic screening queue and qualified clinical review.",
      },
      { property: "og:title", content: "Clinic review | CarePulse" },
      {
        property: "og:description",
        content: "Review received clinic screenings with secure clinical oversight.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClinicReview,
});
function ClinicReview() {
  const { user, ready } = useCarePulseAuth();
  if (!ready) return <CarePulseShell clinic><p role="status">Checking your account…</p></CarePulseShell>;
  return user ? <CarePulseClinicQueue /> : <SampleClinicReview />;
}
function SampleClinicReview() {
  const { threads } = useCarePulseSession();
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [escalated, setEscalated] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const records = threads.filter((thread) => thread.outcome);
  const record = records.find((item) => item.id === selected);
  return (
    <CarePulseShell clinic>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> HUMAN CLINICAL REVIEW
          </div>
          <h1>
            Every concern deserves care<span>.</span>
          </h1>
          <p>Screening submissions from this sample session.</p>
        </div>
        <span className="sample-label">
          <ShieldCheck size={16} /> Sample records only
        </span>
      </div>
      <div className="clinic-summary">
        <div>
          <ClipboardList />
          <strong>{records.length}</strong>
          <span>Local sample screenings</span>
        </div>
        <div>
          <TriangleAlert />
          <strong>{records.filter((item) => item.requestedHealthcareProfessional).length}</strong>
          <span>Professional requested</span>
        </div>
        <div>
          <CheckCircle2 />
          <strong>{reviewed.length}</strong>
          <span>Reviewed</span>
        </div>
      </div>
      <section className="clinic-records">
        <div className="records-heading">
          <h2>Local sample screenings</h2>
          <span>Not the clinic’s received-submission queue</span>
        </div>
        {!records.length ? (
          <div className="clinic-empty">
            <ClipboardList size={36} />
            <h3>No completed screenings yet</h3>
            <p>Completed sample screenings will appear here during this session.</p>
            <Button asChild>
              <a href="/">
                Go to health assistant <ChevronRight />
              </a>
            </Button>
          </div>
        ) : (
          records.map((item) => (
            <div className="record-row" key={item.id}>
              <span className="profile-avatar">JD</span>
              <div className="record-person">
                <strong>Jamie Davis</strong>
                <p>{item.title}</p>
              </div>
              <span className="small-tag">
                {item.requestedHealthcareProfessional
                  ? "Professional requested"
                  : "No priority assigned"}
              </span>
              <span className="review-status">
                {item.submissionState === "failed" ? "Not received by clinic" : "Local sample only"}
              </span>
              <Button variant="outline" onClick={() => setSelected(item.id)}>
                Review <ChevronRight />
              </Button>
            </div>
          ))
        )}
      </section>
      <div className="clinical-caution">
        <ShieldCheck size={20} />
        <p>
          These are unsaved sample screenings, not received clinic records. Sign in to view your
          clinic’s received screenings. Review actions below are local only.
        </p>
      </div>
      {record && (
        <section className="record-detail">
          <div className="records-heading">
            <h2>Screening details</h2>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
          <p>
            <strong>Priority:</strong> Not assigned
          </p>
          <p>
            <strong>Reason:</strong>{" "}
            {record.outcome === "Emergency guidance"
              ? "Patient requested immediate emergency guidance."
              : "Screening protocol is not clinically validated. Human review is required."}
          </p>
          <p>
            <strong>Healthcare professional requested:</strong>{" "}
            {record.requestedHealthcareProfessional ? "Yes" : "No"}
          </p>
          <p>
            <strong>Submission:</strong> Not received by clinic
          </p>
          <h3>Screening responses</h3>
          {record.answers.length ? (
            record.answers.map((answer, index) => (
              <p key={index}>
                {index + 1}. {answer}
              </p>
            ))
          ) : (
            <p>No additional questions collected before emergency guidance.</p>
          )}
          <div className="review-actions">
            <Button
              disabled={reviewed.includes(record.id)}
              onClick={() => setReviewed((previous) => [...previous, record.id])}
            >
              <CheckCircle2 /> Mark sample reviewed
            </Button>
            <Button
              variant="outline"
              disabled={escalated.includes(record.id)}
              onClick={() => setEscalated((previous) => [...previous, record.id])}
            >
              <TriangleAlert /> Escalate for sample review
            </Button>
          </div>
        </section>
      )}
    </CarePulseShell>
  );
}
