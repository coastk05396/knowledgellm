import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast component", () => {
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

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <Toast
        message="Sam signed in successfully"
        department="operations"
        onClose={handleClose}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: "Dismiss notification" });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("automatically dismisses after duration", () => {
    vi.useFakeTimers();
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
    expect(handleClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
