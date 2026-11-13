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
import { useCarePulseSession } from "@/components/carepulse-session";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/clinic")({
  head: () => ({
    meta: [
      { title: "Clinic review | CarePulse" },
      {
        name: "description",
        content:
          "Sample CarePulse clinic review workspace for preliminary screening and escalation.",
      },
      { property: "og:title", content: "Clinic review | CarePulse" },
      {
        property: "og:description",
        content: "Review sample screening submissions and escalation states.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClinicReview,
});
function ClinicReview() {
  const { threads } = useCarePulseSession();
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [escalated, setEscalated] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const records = threads
    .filter((thread) => thread.outcome)
    .sort((a, b) => Number(b.outcome === "Emergency") - Number(a.outcome === "Emergency"));
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
          <span>Submissions</span>
        </div>
        <div>
          <TriangleAlert />
          <strong>{records.filter((item) => item.outcome === "Emergency").length}</strong>
          <span>Emergency priority</span>
        </div>
        <div>
          <CheckCircle2 />
          <strong>{reviewed.length}</strong>
          <span>Reviewed</span>
        </div>
      </div>
      <section className="clinic-records">
        <div className="records-heading">
          <h2>Screening queue</h2>
          <span>Emergency submissions first</span>
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
              <span
                className={`priority-badge ${item.outcome === "Emergency" ? "emergency" : "urgent"}`}
              >
                {escalated.includes(item.id) ? "Escalated" : item.outcome}
              </span>
              <span className="review-status">
                {reviewed.includes(item.id) ? "Reviewed" : "Awaiting review"}
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
          No patient records are connected. Review actions affect this sample session only and do
          not contact clinic staff.
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
            <strong>Priority:</strong> {record.outcome}
          </p>
          <p>
            <strong>Reason:</strong>{" "}
            {record.outcome === "Emergency"
              ? "Patient requested immediate emergency guidance."
              : "Screening protocol is not clinically validated. Human review is required."}
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
              <CheckCircle2 /> Mark reviewed
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
