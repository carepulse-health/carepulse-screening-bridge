import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Heart,
  HeartPulse,
  LayoutDashboard,
  MessageCircle,
  Plus,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCarePulseSession } from "@/lib/carepulse-session-context";

export function CarePulseShell({
  children,
  clinic = false,
}: {
  children: ReactNode;
  clinic?: boolean;
}) {
  const navigate = useNavigate();
  const { threads } = useCarePulseSession();
  const newScreening = () =>
    navigate({ to: "/chat/$threadId", params: { threadId: crypto.randomUUID() } });
  return (
    <div className="carepulse-app">
      <aside className="app-sidebar">
        <Link to="/" className="brand">
          <span className="brand-symbol">
            <HeartPulse />
          </span>
          <span>
            CarePulse<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">PATIENT WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <Button variant="ghost" asChild className={!clinic ? "nav-item active" : "nav-item"}>
            <Link to="/">
              <MessageCircle /> Health assistant <span className="small-tag">AI</span>
            </Link>
          </Button>
          <Button variant="ghost" asChild className={clinic ? "nav-item active" : "nav-item"}>
            <Link to="/clinic">
              <LayoutDashboard /> Clinic review <ArrowUpRight className="nav-end" />
            </Link>
          </Button>
        </nav>
        <div className="sidebar-divider" />
        <div className="section-label">
          YOUR CONVERSATIONS <span>{threads.length.toString().padStart(2, "0")}</span>
        </div>
        <Button variant="outline" className="new-conversation" onClick={newScreening}>
          <Plus /> New screening
        </Button>
        <nav className="thread-list" aria-label="Session conversations">
          {threads.map((thread) => (
            <Button key={thread.id} variant="ghost" asChild className="thread-item">
              <Link to="/chat/$threadId" params={{ threadId: thread.id }}>
                <MessageCircle />
                <span>{thread.title}</span>
              </Link>
            </Button>
          ))}
        </nav>
        {!threads.length && <p className="sidebar-note">No conversations in this session.</p>}
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck />
            <div>
              <strong>Your health, handled with care</strong>
              <p>Conversations are not saved.</p>
            </div>
          </div>
          <div className="sample-profile">
            <span className="profile-avatar">JD</span>
            <div>
              <strong>Jamie Davis</strong>
              <p>Sample patient</p>
            </div>
            <ChevronDown size={16} />
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-header">
          <div className="header-path">
            <span>My care</span>
            <span>/</span>
            <strong>{clinic ? "Clinic review" : "Health assistant"}</strong>
          </div>
          <div className="header-right">
            <span className="sample-label">
              <span /> Sample workspace
            </span>
            <span className="header-avatar">JD</span>
          </div>
        </header>
        <main className="page-content">{children}</main>
        <footer className="app-footer">
          <span>
            <Heart size={12} /> A little guidance. A human touch.
          </span>
          <span>CarePulse · Preliminary screening only</span>
        </footer>
      </div>
    </div>
  );
}

export function PriorityLegend() {
  return (
    <section className="priority-section">
      <h3>
        <ClipboardList size={17} /> Care priorities
      </h3>
      <div className="priority-item">
        <span className="priority-dot routine" />
        <div>
          <strong>Routine</strong>
          <p>Routine clinic consultation</p>
        </div>
      </div>
      <div className="priority-item">
        <span className="priority-dot urgent" />
        <div>
          <strong>Urgent</strong>
          <p>Prompt professional assessment</p>
        </div>
      </div>
      <div className="priority-item">
        <span className="priority-dot emergency" />
        <div>
          <strong>Emergency</strong>
          <p>Immediate emergency attention</p>
        </div>
      </div>
      <p className="legend-note">
        A licensed clinician must approve the screening rules before live use.
      </p>
    </section>
  );
}

export const careIcons = { Activity, CalendarDays, Stethoscope };
