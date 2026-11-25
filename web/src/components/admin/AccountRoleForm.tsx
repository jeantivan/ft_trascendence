"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { GlobalRole } from "@/generated/prisma/client";
import { makeAdminAction, removeAdminAction } from "@/lib/admin/actions";
import type { AccountActionResult } from "@/lib/admin/accounts";
import { resultMessage } from "./result-message";

type RoleKind = "makeAdmin" | "removeAdmin";

interface RoleVariant {
  action: (prevState: unknown, formData: FormData) => Promise<AccountActionResult>;
  // Removing the role takes access away, so it looks like blocking
  buttonVariant: "ghost" | "destructive";
  button: string;
  question: string;
  explanation: string;
  confirm: string;
  pending: string;
}

// Everything that differs between giving and removing the role, in one place
const VARIANTS: Record<RoleKind, RoleVariant> = {
  makeAdmin: {
    action: makeAdminAction,
    buttonVariant: "ghost",
    button: "Hacer administrador",
    question: "¿Dar el rol de administrador a esta cuenta?",
    explanation: "Podrá gestionar todas las cuentas y los clubes desde su siguiente petición.",
    confirm: "Dar el rol",
    pending: "Dando el rol...",
  },
  removeAdmin: {
    action: removeAdminAction,
    buttonVariant: "destructive",
    button: "Quitar el rol de administrador",
    question: "¿Quitar el rol de administrador a esta cuenta?",
    explanation: "Dejará de ver el panel de administración desde su siguiente petición.",
    confirm: "Quitar el rol",
    pending: "Quitando el rol...",
  },
};

// Make an account an Admin or remove its Admin role from the Admin panel (#103).
// Both ask first: they change what the person can do from their next request.
// The form sends only the account; which action runs decides the role
export function AccountRoleForm({ accountId, roleGlobal }: { accountId: string; roleGlobal: GlobalRole }) {
  const kind: RoleKind = roleGlobal === "admin" ? "removeAdmin" : "makeAdmin";
  const variant = VARIANTS[kind];
  const [state, action, pending] = useActionState<AccountActionResult | null, FormData>(variant.action, null);
  const [confirming, setConfirming] = useState(false);
  // The kind of the last submit: when it went through, the page is drawn again with the
  // other role, and the message is still about this one
  const [lastSent, setLastSent] = useState<RoleKind | null>(null);

  const message = lastSent && !pending && resultMessage(lastSent, state);

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert variant={message.variant}>{message.text}</Alert>}

      <Button variant={variant.buttonVariant} disabled={pending} onClick={() => setConfirming(true)}>
        {pending ? variant.pending : variant.button}
      </Button>

      <Modal open={confirming} onClose={() => setConfirming(false)} title={variant.question}>
        <form
          action={action}
          onSubmit={() => {
            setLastSent(kind);
            setConfirming(false);
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-text-secondary">{variant.explanation}</p>
          <input type="hidden" name="accountId" value={accountId} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant={variant.buttonVariant === "destructive" ? "destructive" : undefined}>
              {variant.confirm}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
