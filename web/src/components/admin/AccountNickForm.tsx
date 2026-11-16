"use client";

import { useActionState, useState } from "react";
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
  // Controlled: React 19 resets a form after its action, which would put the old nick
  // back next to the error. The field keeps what the Admin wrote
  const [value, setValue] = useState(nick ?? "");

  const message = resultMessage("nick", state);
  const fieldError = state && !state.ok && state.reason === "invalid-nick" ? state.message : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {message && <Alert variant={message.variant}>{message.text}</Alert>}
      <input type="hidden" name="accountId" value={accountId} />
      <FormField label="Nick" htmlFor="account-nick" error={fieldError}>
        <Input
          id="account-nick"
          name="nick"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
        />
      </FormField>
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? "Guardando..." : "Guardar nick"}
      </Button>
    </form>
  );
}
