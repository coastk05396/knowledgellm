import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast component", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("renders toast message, subtitle, and department style", () => {
    const handleClose = vi.fn();
    render(
      <Toast
        message="Alex signed in successfully"
        subtitle="Finance folder unlocked"
        department="finance"
        onClose={handleClose}
      />,
    );

    expect(screen.getByText("Alex signed in successfully")).toBeInTheDocument();
    expect(screen.getByText("Finance folder unlocked")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("keeps the toast mounted during dismissal and closes only once", () => {
    const handleClose = vi.fn();
    render(
      <Toast
        message="Sam signed in successfully"
        department="operations"
        onClose={handleClose}
      />,
    );

    const closeBtn = screen.getByRole("button", {
      name: "Dismiss notification",
    });
    fireEvent.click(closeBtn);
    fireEvent.click(closeBtn);
    expect(handleClose).not.toHaveBeenCalled();
    expect(screen.getByRole("status").firstElementChild).toHaveClass("closing");
    act(() => vi.advanceTimersByTime(139));
    expect(handleClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("automatically dismisses after duration", () => {
    const handleClose = vi.fn();
    render(
      <Toast
        message="Priya signed in successfully"
        department="people"
        onClose={handleClose}
        duration={3000}
      />,
    );

    expect(handleClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(handleClose).not.toHaveBeenCalled();
    expect(screen.getByRole("status").firstElementChild).toHaveClass("closing");
    act(() => vi.advanceTimersByTime(140));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending close when unmounted", () => {
    const handleClose = vi.fn();
    const { unmount } = render(<Toast message="Saved" onClose={handleClose} />);
    fireEvent.click(screen.getByRole("button"));
    unmount();
    act(() => vi.runAllTimers());
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("does not close a replacement notification with the previous timer", () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <Toast message="First" onClose={handleClose} />,
    );
    fireEvent.click(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(100));
    rerender(<Toast message="Second" onClose={handleClose} />);
    act(() => vi.advanceTimersByTime(140));
    expect(handleClose).not.toHaveBeenCalled();
    expect(screen.getByText("Second").closest(".toast")).not.toHaveClass(
      "closing",
    );
  });

  it("uses a brief exit when reduced motion is requested", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const handleClose = vi.fn();
    render(<Toast message="Saved" onClose={handleClose} />);
    fireEvent.click(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(79));
    expect(handleClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("preserves its lifetime across callback changes and calls the latest callback", () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender } = render(<Toast message="Saved" onClose={firstClose} />);
    act(() => vi.advanceTimersByTime(3900));
    rerender(<Toast message="Saved" onClose={latestClose} />);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText("Saved").closest(".toast")).toHaveClass("closing");
    act(() => vi.advanceTimersByTime(140));
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledTimes(1);
  });
});
