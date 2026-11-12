"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function Modal({ open, onClose, title, closeLabel = "Cerrar", footer, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressStartedOnBackdrop = useRef(false);

  // The parent owns "open"; the <dialog> is only synced to it
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    // Closes when "open" turns false, and also if the parent unmounts the Modal while open
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden overscroll-contain rounded-xl border border-border-strong bg-surface-elevated p-0 text-text-primary open:flex backdrop:bg-surface-base/85 backdrop:backdrop-blur-md"
      onMouseDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // The backdrop belongs to the <dialog> box: only a click on it has the dialog as target.
        // It must also have started there: releasing after a press inside (selecting text)
        // lands the click on the dialog too
        if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose();
      }}
      onClose={() => {
        // The browser closed it by itself (e.g. <form method="dialog">) while the parent
        // still says open. "close" arrives late: if the parent closed it, "open" is already
        // false, and if the effect reopened it since, the dialog is open again
        if (open && !dialogRef.current?.open) onClose();
      }}
      onCancel={(event) => {
        // Escape: don't let the browser close it; the parent flips "open"
        event.preventDefault();
        onClose();
      }}
    >
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-session-cuestas via-session-fartlek to-session-rodaje" />
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-4">
        <h2 id={titleId} className="font-heading text-headline-md">
          {title}
        </h2>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="rounded-sm p-1 text-text-secondary hover:text-text-primary"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
      {footer && <div className="flex shrink-0 justify-end gap-3 border-t border-border-subtle px-6 py-4">{footer}</div>}
    </dialog>
  );
}
