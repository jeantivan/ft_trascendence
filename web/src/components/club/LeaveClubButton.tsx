"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { leaveClubAction } from "@/lib/org/actions";

// Leaves the club after a confirmation (#219). The last Manager is warned: the club stays
// without one until an Admin names another. After leaving, /club is revalidated and the server
// decides which club or view comes next
export function LeaveClubButton({
  orgId,
  clubName,
  isLastManager,
}: {
  orgId: string;
  clubName: string;
  isLastManager: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await leaveClubAction(orgId);
      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Abandonar club
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={`Abandonar ${clubName}`}
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pending} onClick={confirm}>
              {pending ? "Saliendo..." : "Abandonar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          {isLastManager && (
            <Alert variant="info">
              Eres el único Manager de este club. Si sales, se queda sin Manager hasta que un Admin nombre otro.
            </Alert>
          )}
          <p>Dejarás de ser miembro de {clubName} y se retirarán tus plazas en sus eventos.</p>
        </div>
      </Modal>
    </>
  );
}
