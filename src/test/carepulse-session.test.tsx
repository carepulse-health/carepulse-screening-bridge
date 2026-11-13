import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CarePulseSession } from "@/components/carepulse-session";
import { useCarePulseSession, type ScreeningThread } from "@/lib/carepulse-session-context";

afterEach(cleanup);

const thread: ScreeningThread = {
  id: "sample-screening",
  title: "Sample concern",
  messages: [],
  answers: ["Sample concern"],
  outcome: null,
};

function SessionConsumer({ label }: { label: string }) {
  const { threads, updateThread } = useCarePulseSession();
  return (
    <div>
      <output aria-label={label}>{threads.length}</output>
      <button onClick={() => updateThread(thread)}>Add {label}</button>
    </div>
  );
}

describe("CarePulse session provider", () => {
  it("shares one context between the provider and screening consumers across rerenders", () => {
    const view = render(
      <CarePulseSession>
        <SessionConsumer label="screening" />
        <SessionConsumer label="clinic" />
      </CarePulseSession>,
    );
    fireEvent.click(screen.getByText("Add screening"));
    expect(screen.getByLabelText("clinic")).toHaveTextContent("1");
    view.rerender(
      <CarePulseSession>
        <SessionConsumer label="screening" />
        <SessionConsumer label="clinic" />
      </CarePulseSession>,
    );
    expect(screen.getByLabelText("screening")).toHaveTextContent("1");
    fireEvent.click(screen.getByText("Add clinic"));
    expect(screen.getByLabelText("screening")).toHaveTextContent("1");
  });

  it("does not retain conversations after the root session is unmounted", () => {
    const view = render(
      <CarePulseSession>
        <SessionConsumer label="screening" />
      </CarePulseSession>,
    );
    fireEvent.click(screen.getByText("Add screening"));
    expect(screen.getByLabelText("screening")).toHaveTextContent("1");
    view.unmount();
    render(
      <CarePulseSession>
        <SessionConsumer label="screening" />
      </CarePulseSession>,
    );
    expect(screen.getByLabelText("screening")).toHaveTextContent("0");
  });
});
