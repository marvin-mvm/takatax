/**
 * The "are you sure?" pop-up in the Takatax theme, used in place of the browser's own confirm
 * box: a question, what it is about, and what will happen as a short list.
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: "Delete this file?", confirm: "Delete file" }))) return;
 *
 * Render `{dialog}` once, anywhere in the component. Escape and the cancel button answer no;
 * a click outside does nothing, so nothing is deleted or dismissed by accident.
 */

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Trash2, TriangleAlert } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";

import { buttonDanger, buttonOutline } from "@/components/site/styles";

export interface ConfirmContent {
  /** The question, for example "Delete this file?". */
  title: string;
  /** What it is about, for example the file's name. */
  subject?: string | undefined;
  /** What will happen, one short line each. */
  points?: readonly string[] | undefined;
  /** The button that goes ahead, for example "Delete file". */
  confirm: string;
  /** The button that backs out. "Cancel" unless set. */
  cancel?: string | undefined;
  /** "delete" shows a bin, "warning" a warning sign. */
  kind?: "delete" | "warning" | undefined;
}

interface Asked {
  content: ConfirmContent;
  answer: (yes: boolean) => void;
}

export function useConfirm(): {
  /** Asks the question and resolves true only when the person goes ahead. */
  confirm: (content: ConfirmContent) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [asked, setAsked] = useState<Asked | null>(null);
  /** What had the focus when the question was asked, to give it back afterwards. */
  const opener = useRef<HTMLElement | null>(null);

  const confirm = useCallback(
    (content: ConfirmContent) =>
      new Promise<boolean>((resolve) => {
        const active = document.activeElement;
        opener.current = active instanceof HTMLElement ? active : null;
        setAsked({ content, answer: resolve });
      }),
    [],
  );

  const settle = (yes: boolean) => {
    asked?.answer(yes);
    setAsked(null);
  };

  if (!asked) return { confirm, dialog: null };

  const { title, subject, points = [], confirm: go, cancel = "Cancel", kind } = asked.content;
  const Icon = kind === "delete" ? Trash2 : TriangleAlert;
  const subjectLine = subject ? (
    <p className="mt-0.5 truncate text-sm text-tk-muted" title={subject}>
      {subject}
    </p>
  ) : null;

  const dialog = (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="tk-theme fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-[20px] border border-tk-line bg-tk-surface p-6 text-left font-tk-sans text-tk-ink shadow-[0_24px_64px_rgb(0_0_0/0.24)] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tk-danger-soft text-tk-danger"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <AlertDialog.Title className="text-lg/6 font-semibold text-balance">
                {title}
              </AlertDialog.Title>
              {points.length > 0 || !subjectLine ? (
                subjectLine
              ) : (
                <AlertDialog.Description asChild>{subjectLine}</AlertDialog.Description>
              )}
            </div>
          </div>
          {points.length > 0 ? (
            <AlertDialog.Description asChild>
              <ul className="list-disc rounded-[12px] bg-tk-bg py-3 pr-4 pl-9 text-[15px]/6 marker:text-tk-danger">
                {points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </AlertDialog.Description>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className={buttonOutline}>{cancel}</AlertDialog.Cancel>
            <button type="button" onClick={() => settle(true)} className={buttonDanger}>
              {go}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );

  return { confirm, dialog };
}
