"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { blockAccountAction, unblockAccountAction } from "@/lib/admin/actions";
import type { AccountActionResult } from "@/lib/admin/accounts";
import { formatDate } from "./format";
import { resultMessage } from "./result-message";

// Block or unblock an account from the Admin panel (#102). Blocking asks first:
// the person is out on their next request. Unblocking does not ask, so the line
// next to its button says the account is blocked and since when
export function AccountBlockForm({ accountId, blockedAt }: { accountId: string; blockedAt: Date | null }) {
  const [blockState, blockAction, blocking] = useActionState<AccountActionResult | null, FormData>(
    blockAccountAction,
    null,
  );
  const [unblockState, unblockAction, unblocking] = useActionState<AccountActionResult | null, FormData>(
    unblockAccountAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);
  // Both results stay in memory: the message is about the last button pressed
  const [lastPressed, setLastPressed] = useState<"block" | "unblock" | null>(null);

  // While that button's action is on its way, its state still holds the result of the
  // time before (block, unblock, block again): no message until the new one arrives
  const pending = lastPressed === "block" ? blocking : unblocking;
  const message =
    lastPressed && !pending && resultMessage(lastPressed, lastPressed === "block" ? blockState : unblockState);

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert variant={message.variant}>{message.text}</Alert>}

      {blockedAt ? (
        <form action={unblockAction} onSubmit={() => setLastPressed("unblock")} className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">Cuenta bloqueada desde el {formatDate(blockedAt)}.</p>
          <input type="hidden" name="accountId" value={accountId} />
          <Button type="submit" variant="ghost" disabled={unblocking}>
            {unblocking ? "Desbloqueando..." : "Desbloquear cuenta"}
          </Button>
        </form>
      ) : (
        <Button variant="destructive" disabled={blocking} onClick={() => setConfirming(true)}>
          {blocking ? "Bloqueando..." : "Bloquear cuenta"}
        </Button>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title="¿Bloquear esta cuenta?">
        <form
          action={blockAction}
          onSubmit={() => {
            setLastPressed("block");
            setConfirming(false);
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-text-secondary">
            No podrá entrar en la app desde su siguiente petición, hasta que la desbloquees.
          </p>
          <input type="hidden" name="accountId" value={accountId} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive">
              Bloquear
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
