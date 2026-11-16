import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useConfirm } from "./confirm";

function Harness({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void confirm({
            title: "Delete this file?",
            subject: "rent.jpg",
            kind: "delete",
            points: ["The file and its parsed records are deleted.", "This cannot be undone."],
            confirm: "Delete file",
          }).then(onAnswer)
        }
      >
        Ask
      </button>
      {dialog}
    </>
  );
}

afterEach(cleanup);

describe("useConfirm", () => {
  const ask = () => {
    const onAnswer = vi.fn();
    render(<Harness onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    return onAnswer;
  };

  it("asks in its own pop-up, with the consequences as a list, and never the browser's box", () => {
    const browserBox = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onAnswer = ask();

    const dialog = screen.getByRole("alertdialog", { name: "Delete this file?" });
    expect(within(dialog).getByText("rent.jpg")).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["The file and its parsed records are deleted.", "This cannot be undone."]);
    // The list is what a screen reader reads as the pop-up's description.
    expect(dialog).toHaveAccessibleDescription(
      "The file and its parsed records are deleted. This cannot be undone.",
    );
    expect(dialog.className).toContain("tk-theme");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(browserBox).not.toHaveBeenCalled();
    browserBox.mockRestore();
  });

  it("answers yes only on the button that goes ahead", async () => {
    const onAnswer = ask();
    fireEvent.click(screen.getByRole("button", { name: "Delete file" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("answers no on Cancel", async () => {
    const onAnswer = ask();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("answers no on Escape", async () => {
    const onAnswer = ask();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("can be asked again after an answer", async () => {
    const onAnswer = ask();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete file" }));
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith(true));
  });
});
