"use client";

import { useActionState } from "react";
import { registerAction, type AuthActionResult } from "@/lib/auth/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";

const initialState: AuthActionResult = { success: true };

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <h1 className="font-heading text-headline-lg-mobile md:text-headline-lg">Crear Cuenta</h1>

      {!state.success && <Alert variant="error">{state.error}</Alert>}

      <FormField label="Nick" htmlFor="nick">
        <Input
          id="nick"
          name="nick"
          type="text"
          required
          autoComplete="username"
          placeholder="fastrunner"
        />
      </FormField>

      <FormField label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="runner@42madrid.com"
        />
      </FormField>

      <FormField label="Contraseña (mínimo 8 caracteres)" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </FormField>

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Registrando..." : "Crear cuenta"}
      </Button>

      <p className="mt-2 text-body-sm text-text-secondary">¿Ya tienes cuenta?</p>
      <Button variant="ghost" href="/login">
        Inicia sesión aquí
      </Button>
    </form>
  );
}
