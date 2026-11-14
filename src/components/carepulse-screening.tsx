import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import {
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  HeartPulse,
  Info,
  Mic,
  Phone,
  ShieldCheck,
  Stethoscope,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import nurseImage from "@/assets/carepulse-nurse.jpg";
import { emergencyGuidance, screeningQuestions, screeningStep } from "@/lib/screening";
import {
  completionSubmission,
  submissionUnavailable,
  wantsHealthcareProfessional,
} from "@/lib/screening-submission";
import { CarePulseShell, PriorityLegend } from "./carepulse-shell";
import { useCarePulseSession, type ScreeningThread } from "@/lib/carepulse-session-context";

const intro =
  "Hello, Jamie. I’m here to help you take the next step with your health. What is your main health concern?";
function textMessage(role: "user" | "assistant", text: string): UIMessage {
  return { id: crypto.randomUUID(), role, parts: [{ type: "text", text }] };
}

export function CarePulseScreening({ threadId }: { threadId?: string }) {
  const { threads, updateThread } = useCarePulseSession();
  const navigate = useNavigate();
  const thread = threads.find((item) => item.id === threadId);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const [showSafety, setShowSafety] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, thread?.messages.length]);

  function submit(text: string) {
    if (!text.trim() || thread?.outcome) return;
    if (thread?.answers.length === 9 && wantsHealthcareProfessional(text) === null) {
      updateThread({
        ...thread,
        messages: [
          ...thread.messages,
          textMessage("user", text.trim()),
          textMessage(
            "assistant",
            "Would you like to speak with a healthcare professional? Please choose Yes or No.",
          ),
        ],
      });
      setInput("");
      return;
    }
    const id = threadId ?? crypto.randomUUID();
    const current: ScreeningThread = thread ?? {
      id,
      title: text.trim().slice(0, 32),
      messages: [textMessage("assistant", intro)],
      answers: [],
      outcome: null,
    };
    const answers = [...current.answers, text.trim()];
    const step = screeningStep(answers.length, false);
    const completion = completionSubmission(answers);
    const response = step.finished
      ? completion.requested
        ? `Thank you. You requested a healthcare professional. ${submissionUnavailable} No clinical priority has been assigned.`
        : "Thank you for sharing. You have not requested a healthcare professional, so this screening has not been submitted. No clinical priority has been assigned. If you feel seriously unwell, seek immediate medical attention."
      : `${answers.length === 1 ? "Thank you for sharing, Jamie. " : ""}${step.question}`;
    updateThread({
      ...current,
      answers,
      messages: [
        ...current.messages,
        textMessage("user", text.trim()),
        textMessage("assistant", response),
      ],
      outcome: step.outcome,
      requestedHealthcareProfessional: completion.requested,
      submissionState: completion.state,
    });
    setInput("");
    if (!threadId) void navigate({ to: "/chat/$threadId", params: { threadId: id } });
    inputRef.current?.focus();
  }

  function emergency() {
    const id = threadId ?? crypto.randomUUID();
    const current: ScreeningThread = thread ?? {
      id,
      title: "Emergency help",
      messages: [],
      answers: [],
      outcome: null,
    };
    updateThread({
      ...current,
      outcome: "Emergency guidance",
      messages: [...current.messages, textMessage("assistant", emergencyGuidance)],
    });
    if (!threadId) void navigate({ to: "/chat/$threadId", params: { threadId: id } });
  }

  function readAloud() {
    if (!("speechSynthesis" in window)) {
      setNotice("Read aloud is not supported in this browser.");
      return;
    }
    const last = thread?.messages.filter((message) => message.role === "assistant").at(-1);
    const text =
      last?.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ") ?? intro;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const complete = Boolean(thread?.outcome);
  const count = thread?.answers.length ?? 0;
  return (
    <CarePulseShell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> YOUR HEALTH COMPANION
          </div>
          <h1>
            Care starts with a conversation<span>.</span>
          </h1>
          <p>Let’s understand how you’re feeling and find the right next step.</p>
        </div>
        <Button variant="outline" className="safety-button" onClick={() => setShowSafety(true)}>
          <ShieldCheck /> Your privacy & safety
        </Button>
      </div>
      <div className="screening-layout">
        <section className="assistant-panel" aria-label="Health screening conversation">
          <div className="assistant-header">
            <span className="assistant-mark">
              <HeartPulse />
            </span>
            <div>
              <h2>
                CarePulse Assistant <span className="assistant-tag">AI</span>
              </h2>
              <p>
                <span className="status-dot" /> Here to listen
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Read response aloud"
              aria-label="Read response aloud"
              onClick={readAloud}
            >
              <Volume2 />
            </Button>
          </div>
          <div className="screening-banner">
            <ShieldCheck size={15} />
            <span>Preliminary screening, not a diagnosis. A clinician makes the final call.</span>
          </div>
          {thread?.messages.length ? (
            <Conversation className="transcript">
              <ConversationContent>
                {thread.messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.parts.map((part, index) =>
                        part.type === "text" ? (
                          <MessageResponse key={index}>{part.text}</MessageResponse>
                        ) : null,
                      )}
                    </MessageContent>
                  </Message>
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          ) : (
            <div className="assistant-welcome">
              <span className="welcome-symbol">
                <HeartPulse size={32} />
              </span>
              <span className="welcome-eyebrow">A LITTLE CHECK-IN, JUST FOR YOU</span>
              <h2>
                Hi Jamie, how are you
                <br />
                feeling today?
              </h2>
              <p>
                Share what’s on your mind. We’ll take it
                <br className="desktop-break" /> one question at a time.
              </p>
              <div className="concern-options">
                {["I’m feeling unwell", "I have pain or discomfort", "I have another concern"].map(
                  (label) => (
                    <Button key={label} variant="outline" onClick={() => submit(label)}>
                      {label}
                      <ArrowUp size={13} />
                    </Button>
                  ),
                )}
              </div>
            </div>
          )}
          {complete && (
            <div
              className={`outcome-banner ${thread?.outcome === "Emergency guidance" ? "emergency-outcome" : "review-outcome"}`}
              role="status"
            >
              <Info size={18} />
              <div>
                <strong>
                  {thread?.outcome === "Emergency guidance"
                    ? "Seek emergency help now"
                    : thread?.submissionState === "failed"
                      ? "Not submitted · Your clinic has not received it"
                      : "Screening complete · Not submitted"}
                </strong>
                <p>
                  {thread?.requestedHealthcareProfessional
                    ? "Healthcare professional requested. Please contact your clinic directly."
                    : "No clinical priority assigned. No clinic notification sent."}
                </p>
              </div>
            </div>
          )}
          <div className="composer-area">
            {count === 9 && !complete && (
              <div className="concern-options">
                <Button variant="outline" onClick={() => submit("Yes")}>
                  Yes
                </Button>
                <Button variant="outline" onClick={() => submit("No")}>
                  No
                </Button>
              </div>
            )}
            <PromptInput onSubmit={({ text }) => submit(text)}>
              <PromptInputTextarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={complete}
                aria-label="Describe your health concern"
                placeholder={
                  complete ? "This screening is complete" : "Tell me how you’re feeling…"
                }
              />
              <PromptInputFooter>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  title="Voice input availability"
                  aria-label="Voice input availability"
                  onClick={() =>
                    setNotice(
                      "Voice transcription will be available after secure voice processing is connected. Please type your sample concern for now.",
                    )
                  }
                >
                  <Mic />
                </Button>
                <span className="composer-hint">One step closer to the right care</span>
                <PromptInputSubmit
                  disabled={!input.trim() || complete}
                  status="ready"
                  aria-label="Send message"
                >
                  <ArrowUp />
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>
            <p className="composer-disclaimer">
              <ShieldCheck size={12} /> Sample information only · Chats disappear when you reload
            </p>
            {notice && (
              <div className="inline-notice" role="status">
                <Info size={16} />
                <p>{notice}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Dismiss notice"
                  onClick={() => setNotice("")}
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
        </section>
        <aside className="care-rail">
          <section className="journey-section">
            <div className="rail-heading">
              <h3>Your care journey</h3>
              <span>0{complete ? 3 : count ? 2 : 1} / 03</span>
            </div>
            <div className={`journey-step ${count ? "done" : "current"}`}>
              <span>{count ? <Check size={15} /> : "1"}</span>
              <div>
                <strong>Tell us how you feel</strong>
                <p>Start with your main concern</p>
              </div>
            </div>
            <div className={`journey-step ${count && !complete ? "current" : ""}`}>
              <span>{complete ? <Check size={15} /> : "2"}</span>
              <div>
                <strong>A few helpful questions</strong>
                <p>
                  {count
                    ? `${Math.min(count, 10)} of ${screeningQuestions.length} answers collected`
                    : "A clearer picture of your health"}
                </p>
              </div>
            </div>
            <div className={`journey-step ${complete ? "current" : ""}`}>
              <span>3</span>
              <div>
                <strong>Find your next step</strong>
                <p>Guidance for the right care</p>
              </div>
            </div>
          </section>
          <PriorityLegend />
          <section className="human-care">
            <img
              src={nurseImage}
              alt="A welcoming healthcare professional in a clinic"
              width={768}
              height={768}
            />
            <div className="human-care-body">
              <span className="human-eyebrow">
                <Stethoscope size={13} /> PEOPLE BEHIND YOUR CARE
              </span>
              <h3>
                AI guidance.
                <br />
                Human care.
              </h3>
              <p>Your clinic team makes the final care decisions.</p>
              <Button
                variant="link"
                onClick={() =>
                  setNotice(
                    "This is a sample workspace. Clinic contact details have not been connected.",
                  )
                }
              >
                Contact your clinic <ArrowRight />
              </Button>
            </div>
          </section>
        </aside>
      </div>
      <div className="emergency-strip">
        <span className="emergency-icon">
          <Phone size={17} />
        </span>
        <div>
          <strong>Need immediate help?</strong>
          <span> If you feel seriously unwell, don’t wait for a chat response.</span>
        </div>
        <Button variant="link" onClick={emergency}>
          Get emergency guidance <ArrowUpRightIcon />
        </Button>
      </div>
      {showSafety && (
        <div className="modal-backdrop" onClick={() => setShowSafety(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="safety-title"
            className="safety-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-heading">
              <ShieldCheck />
              <h2 id="safety-title">Your privacy & safety</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close safety information"
                onClick={() => setShowSafety(false)}
              >
                <X />
              </Button>
            </div>
            <p>
              This workspace uses sample patients. Do not enter real personal or medical
              information.
            </p>
            <p>
              CarePulse does not diagnose, prescribe medication, or replace a healthcare
              professional. Screening rules require licensed-clinician approval before use with
              patients.
            </p>
            <p>
              Chats are held only in this session and disappear on reload. This screening cannot be
              submitted until the clinic can accept unclassified results. No clinic notifications
              are sent by this sample workflow.
            </p>
            <Button onClick={() => setShowSafety(false)}>
              <CheckCircle2 /> Understood
            </Button>
          </section>
        </div>
      )}
    </CarePulseShell>
  );
}
function ArrowUpRightIcon() {
  return <ChevronRight size={16} />;
}
