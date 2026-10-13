import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

describe("Composer", () => {
  it("does not submit Enter while an IME composition is active", () => {
    const onSend = vi.fn(async () => true);
    render(
      <Composer
        onSend={onSend}
        disabled={false}
        busy={false}
        name="Alex"
        access="Finance"
        sourceCount={2}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "Your question" });
    fireEvent.change(textarea, { target: { value: "預算問題" } });

    fireEvent.keyDown(textarea, {
      key: "Enter",
      isComposing: true,
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("預算問題");
  });
});
