import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceReader, type ReaderSource } from "./SourceReader";

const source: ReaderSource = {
  request: 1,
  id: "finance-q4",
  title: "Q4 budget overview",
  department: "finance",
  document: { url: "https://docs.example.com/q4.md", content: "Budget text" },
};

function Sheet({
  request = 1,
  modal = true,
  onClose,
}: {
  request?: number;
  modal?: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [seen, setSeen] = useState(request);
  if (seen !== request) {
    // Mirrors the workspace: a new open cancels a pending close.
    setSeen(request);
    setClosing(false);
  }
  return (
    <SourceReader
      source={{ ...source, request }}
      modal={modal}
      closing={closing}
      onDismiss={() => setClosing(true)}
      onClose={onClose}
    />
  );
}

describe("SourceReader sheet dismissal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["motion", false, 200],
    ["reduced motion", true, 80],
  ])("stays mounted while leaving with %s", (_name, reduced, exit) => {
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    const onClose = vi.fn();
    const { container } = render(<Sheet onClose={onClose} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Close source content" }),
    );
    expect(screen.getByRole("dialog")).toHaveClass("closing");
    expect(container.querySelector(".reader-backdrop")).toHaveClass("closing");
    expect(screen.getByText("Budget text")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(exit - 1));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cancels the close when the source is opened again", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sheet onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toHaveClass("closing");
    rerender(<Sheet request={2} onClose={onClose} />);
    expect(screen.getByRole("dialog")).not.toHaveClass("closing");
    expect(
      screen.getByRole("button", { name: "Close source content" }),
    ).toHaveFocus();
    act(() => vi.advanceTimersByTime(400));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Budget text")).toBeInTheDocument();
  });

  it("ignores a backdrop click that belongs to the opening gesture", () => {
    const onClose = vi.fn();
    const { container } = render(<Sheet onClose={onClose} />);
    const backdrop = container.querySelector(".reader-backdrop")!;
    fireEvent.click(backdrop, { detail: 2 });
    expect(screen.getByRole("dialog")).not.toHaveClass("closing");
    fireEvent.click(backdrop, { detail: 1 });
    expect(screen.getByRole("dialog")).toHaveClass("closing");
  });

  it("drops a pending close when the layout stops being a sheet", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sheet onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    rerender(
      <SourceReader
        source={source}
        modal={false}
        onDismiss={() => {}}
        onClose={onClose}
      />,
    );
    act(() => vi.advanceTimersByTime(400));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("complementary")).not.toHaveClass("closing");
  });
});
