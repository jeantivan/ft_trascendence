import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/Modal";

// jsdom does not implement showModal() or close() on <dialog>: these stand-ins
// only toggle the "open" attribute, which is what the browser does first
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("Modal", () => {
  it("is a dialog named by its title with the body and footer inside while open", () => {
    render(
      <Modal open onClose={vi.fn()} title="Registrar métricas" footer={<button type="button">Guardar</button>}>
        <p>Cuerpo</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar métricas" });
    expect(dialog).toHaveTextContent("Cuerpo");
    expect(dialog).toHaveTextContent("Guardar");
  });

  it("asks to close on Escape and keeps itself open: the parent decides", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    // Escape makes the browser fire "cancel" and then close the dialog by itself
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it("asks to close from its close button", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks to close when the backdrop is clicked, not when its content is", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    fireEvent.click(screen.getByText("Cuerpo"));
    expect(onClose).not.toHaveBeenCalled();
    // The backdrop is part of the <dialog> box: a click on it targets the dialog itself
    fireEvent.mouseDown(screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when a press starts inside and is released on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    // e.g. selecting text in the body and letting go outside: click lands on the common ancestor
    fireEvent.mouseDown(screen.getByText("Cuerpo"));
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("names the close button with closeLabel", () => {
    render(
      <Modal open onClose={vi.fn()} title="Log metrics" closeLabel="Close">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("follows open from closed to open to closed to open again", () => {
    const { rerender } = render(
      <Modal open={false} onClose={vi.fn()} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    const show = (open: boolean) =>
      rerender(
        <Modal open={open} onClose={vi.fn()} title="Registrar métricas">
          <p>Cuerpo</p>
        </Modal>
      );
    show(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    show(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    show(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("asks to close when the browser closes it by itself, e.g. a form with method dialog", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    // The browser has already closed it when "close" fires
    dialog.removeAttribute("open");
    fireEvent(dialog, new Event("close", { bubbles: false }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores a late close event when the dialog has been reopened since", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    // e.g. StrictMode: cleanup closes, the effect reopens, then the queued "close" arrives
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is not shown while closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Registrar métricas">
        <p>Cuerpo</p>
      </Modal>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
