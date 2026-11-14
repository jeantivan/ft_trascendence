"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { updateAccountNickAction } from "@/lib/admin/actions";
import type { UpdateNickResult } from "@/lib/admin/accounts";
import { resultMessage } from "./result-message";

// Change an offensive nick from the Admin panel (#102), with the sign-up rule
export function AccountNickForm({ accountId, nick }: { accountId: string; nick: string | null }) {
  const [state, formAction, saving] = useActionState<UpdateNickResult | null, FormData>(
    updateAccountNickAction,
    null,
  );

  const message = resultMessage("nick", state);
  const fieldError = state && !state.ok && state.reason === "invalid-nick" ? state.message : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {message && <Alert variant={message.variant}>{message.text}</Alert>}
      <input type="hidden" name="accountId" value={accountId} />
      <FormField label="Nick" htmlFor="account-nick" error={fieldError}>
        <Input id="account-nick" name="nick" type="text" defaultValue={nick ?? ""} autoComplete="off" />
      </FormField>
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? "Guardando..." : "Guardar nick"}
      </Button>
    </form>
  );
}
