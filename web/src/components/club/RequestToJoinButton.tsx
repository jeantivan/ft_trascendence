"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { requestToJoinAction, type MembershipRequestActionResult } from "@/lib/org/actions";

// Asks to join one club (#218). On success the action revalidates /club, so the row comes
// back with "Solicitud pendiente" and no button
export function RequestToJoinButton({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<MembershipRequestActionResult | null, FormData>(
    requestToJoinAction.bind(null, orgId),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      {state && !state.success && <Alert variant="error">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Solicitando..." : "Solicitar"}
      </Button>
    </form>
  );
}
