import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronRight, ClipboardList, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { getClinicScreenings, saveClinicalReview } from "@/lib/screening.functions";
import { useCarePulseAuth } from "@/lib/carepulse-auth-context";
import { CarePulseShell } from "./carepulse-shell";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function CarePulseClinicQueue() {
  const { user } = useCarePulseAuth();
  const fetchRecords = useServerFn(getClinicScreenings);
  const saveReview = useServerFn(saveClinicalReview);
  const [clinicId, setClinicId] = useState<string>();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Public sample page; private reads happen only here, never during public SSR.
  const query = useQuery({ queryKey: ["clinic-screenings", user?.id, clinicId, page], enabled: Boolean(user), queryFn: () => fetchRecords({ data: { clinicId, page } }) });
  const data = query.data;
  const record = data?.records.find(r => r.id === selected);
  async function review() {
    if (!record || !data?.clinic || busy) return;
    setBusy(true); setMessage("");
    try {
      await saveReview({ data: { id: record.id, clinicId: data.clinic.id, action } });
      await query.refetch(); setMessage("Clinical review saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review was not confirmed. Please refresh and try again."); }
    finally { setBusy(false); }
  }
  return <CarePulseShell clinic>
    <div className="page-heading"><div><div className="eyebrow"><span /> HUMAN CLINICAL REVIEW</div><h1>Every concern deserves care<span>.</span></h1><p>{data?.clinic?.name ?? "Clinic screenings awaiting human review"}</p></div><span className="sample-label"><ShieldCheck size={16} /> Received clinic records</span></div>
    {query.isPending ? <p role="status">Loading screenings…</p> : query.isError ? <div className="clinic-empty"><p role="alert">Could not load clinic screenings. Your access or connection could not be verified.</p><Button onClick={() => void query.refetch()}><RefreshCw /> Try again</Button></div> : !data?.clinic ? <div className="clinic-empty"><ClipboardList size={36} /><h3>No authorised clinic access</h3><p>Your clinic must assign your staff account before you can view screenings.</p></div> : <>
      {data.clinics.length > 1 && <Select value={data.clinic.id} onValueChange={id => { setClinicId(id); setPage(0); setSelected(undefined); setMessage(""); }}><SelectTrigger aria-label="Clinic"><SelectValue /></SelectTrigger><SelectContent>{data.clinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>}
      <div className="clinic-summary"><div><ClipboardList /><strong>{data.total}</strong><span>Received screenings</span></div><div><TriangleAlert /><strong>{data.records.filter(r => r.requested).length}</strong><span>Professional requested · This page</span></div><div><CheckCircle2 /><strong>{data.weeklyCount ?? "—"}</strong><span>Reviewed this week · Lagos</span></div></div>
      {!data.reviewReady && <p className="clinical-caution" role="status"><ShieldCheck /> Secure review recording and the weekly count await approval of the review SQL.</p>}
      <section className="clinic-records"><div className="records-heading"><h2>Submitted screenings</h2><Button variant="ghost" size="icon" aria-label="Refresh screenings" title="Refresh screenings" onClick={() => void query.refetch()}><RefreshCw /></Button></div>
        {!data.records.length ? <div className="clinic-empty"><ClipboardList size={36} /><h3>No received screenings</h3><p>Confirmed patient submissions will appear here.</p></div> : data.records.map(item => <div className="record-row" key={item.id}><span className="profile-avatar">{item.name.slice(0, 2).toUpperCase()}</span><div className="record-person"><strong>{item.name}</strong><p>{item.summary}</p></div><span className="small-tag">{item.priority}</span><span className="review-status">{item.status}</span><Button variant="outline" onClick={() => { setSelected(item.id); setAction(item.action ?? ""); setMessage(""); }}>Review <ChevronRight /></Button></div>)}
      </section>
      <div className="review-actions"><Button variant="outline" disabled={page === 0} onClick={() => { setPage(page - 1); setSelected(undefined); }}>Previous</Button><span>Page {page + 1}</span><Button variant="outline" disabled={(page + 1) * 25 >= data.total} onClick={() => { setPage(page + 1); setSelected(undefined); }}>Next</Button></div>
      <div className="clinical-caution"><ShieldCheck /><p>Screening is not a diagnosis. Clinical judgment is required; no automatic urgency is assigned.</p></div>
      {record && <section className="record-detail"><div className="records-heading"><h2>Screening details</h2><Button variant="ghost" onClick={() => setSelected(undefined)}>Close</Button></div>
        <p><strong>Priority:</strong> {record.priority}</p><p><strong>Summary:</strong> {record.summary}</p><p><strong>Healthcare professional requested:</strong> {record.requested ? "Yes" : "No"}</p><p><strong>Review status:</strong> {record.status}</p>
        <p className="break-all"><strong>Reviewed by:</strong> {record.reviewer ?? "Not yet reviewed"}</p><p><strong>Reviewed at:</strong> {record.reviewedAt ? new Date(record.reviewedAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" }) + " (Lagos)" : "Not recorded"}</p>
        <h3>Screening responses</h3>{record.answers.map((answer, index) => <p key={index} className="break-words">{index + 1}. {answer}</p>)}
        <label className="grid gap-2 mt-6">Clinical review action<Textarea value={action} maxLength={5000} onChange={e => setAction(e.target.value)} disabled={data.clinic.role !== "doctor" || record.status === "reviewed" || !data.reviewReady} /></label>
        <div className="review-actions"><Button disabled={busy || !data.reviewReady || data.clinic.role !== "doctor" || record.status === "reviewed" || !action.trim()} onClick={() => void review()}><CheckCircle2 /> {busy ? "Saving…" : "Save clinical review"}</Button></div>
        {data.clinic.role !== "doctor" && <p>Only an authorised doctor can complete clinical review.</p>}
        {message && <p role="status">{message}</p>}
      </section>}
    </>}
  </CarePulseShell>;
}