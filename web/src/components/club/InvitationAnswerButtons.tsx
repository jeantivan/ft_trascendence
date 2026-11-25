"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { answerInvitationAction, type MembershipRequestActionResult } from "@/lib/org/actions";

// Accepts or rejects one invitation. Both buttons send the same form; `decision` says which
export function InvitationAnswerButtons({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<MembershipRequestActionResult | null, FormData>(
    answerInvitationAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      {state && !state.success && <Alert variant="error">{state.error}</Alert>}
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="accept" disabled={pending}>
          Aceptar
        </Button>
        <Button type="submit" name="decision" value="reject" variant="ghost" disabled={pending}>
          Rechazar
        </Button>
      </div>
    </form>
  );
}
