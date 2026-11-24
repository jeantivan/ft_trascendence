"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { withdrawRequestAction, type MembershipRequestActionResult } from "@/lib/org/actions";

// Withdraws the user's own pending request (#218)
export function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<MembershipRequestActionResult | null, FormData>(
    withdrawRequestAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      {state && !state.success && <Alert variant="error">{state.error}</Alert>}
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Retirando..." : "Retirar"}
      </Button>
    </form>
  );
}
