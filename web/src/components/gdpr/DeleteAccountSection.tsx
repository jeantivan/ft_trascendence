"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteAccountAction, requestDeleteCodeAction } from "@/lib/gdpr/actions";

const CODE_LENGTH = 6;
// Visual aid only: the server applies the real cooldown (issueOtp) and returns
// retryAfterSeconds when it refuses
const COOLDOWN_SECONDS = 60;

type RequestFeedback = { kind: "sent" } | { kind: "error"; message: string };

const buttonBase =
  "inline-flex h-12 items-center justify-center rounded px-6 font-heading font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

// Drop-in section for Ajustes > Privacidad: it needs no props and no route of its own
export function DeleteAccountSection() {
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteAccountAction, { success: true });
  const [isRequesting, startRequest] = useTransition();
  const [feedback, setFeedback] = useState<RequestFeedback | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const busy = isRequesting || isDeleting;

  function requestCode() {
    startRequest(async () => {
      const result = await requestDeleteCodeAction();
      if (result.success) {
        setFeedback({ kind: "sent" });
        setCooldown(COOLDOWN_SECONDS);
        return;
      }
      setFeedback({ kind: "error", message: result.error });
      if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds);
    });
  }

  return (
    <section
      aria-labelledby="delete-account-title"
      className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-elevated p-6"
    >
      <h2 id="delete-account-title" className="font-heading text-xl font-bold text-text-primary">
        Borrar cuenta
      </h2>
      <p className="text-text-secondary">
        Borrar tu cuenta es una acción definitiva. Se eliminarán tu cuenta y los datos asociados según nuestra
        Política de Privacidad; algunos registros mínimos de auditoría se conservarán durante el plazo indicado
        en ella. Para confirmar el borrado, solicita un código por correo e introdúcelo aquí.
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={requestCode}
          disabled={busy || cooldown > 0}
          className={`${buttonBase} bg-volt text-surface-base hover:scale-[1.01] focus-visible:outline-volt`}
        >
          {isRequesting ? "Enviando…" : cooldown > 0 ? `Reenviar en ${cooldown} s` : "Enviar código"}
        </button>
        {feedback?.kind === "sent" && (
          <p role="status" className="text-sm text-text-secondary">
            Te hemos enviado un código a tu correo. Caduca en 10 minutos.
          </p>
        )}
        {feedback?.kind === "error" && (
          <p role="alert" className="text-sm text-red-400">
            {feedback.message}
          </p>
        )}
      </div>

      <form action={deleteAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="delete-account-code" className="text-sm font-medium text-text-primary">
            Código de confirmación
          </label>
          <input
            id="delete-account-code"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            disabled={busy}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            className="h-12 rounded border border-border-subtle bg-surface-overlay px-3 text-text-primary focus:border-volt focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {!deleteState.success && (
          <p role="alert" className="text-sm text-red-400">
            {deleteState.error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || code.length !== CODE_LENGTH}
          className={`${buttonBase} border border-red-500 bg-surface-overlay text-red-500 focus-visible:outline-red-500`}
        >
          {isDeleting ? "Borrando…" : "Borrar mi cuenta definitivamente"}
        </button>
      </form>
    </section>
  );
}
