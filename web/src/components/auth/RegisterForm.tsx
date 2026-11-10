"use client";

import Link from "next/link";
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
      <h1 className="text-2xl font-bold text-center">Crear Cuenta</h1>

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

      <p className="text-sm text-center text-neutral-500 mt-2">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-blue-500 underline hover:text-blue-400">
          Inicia sesión aquí
        </Link>
      </p>
    </form>
  );
}
