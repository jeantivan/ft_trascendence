"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthActionResult } from "@/lib/auth/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";

const initialState: AuthActionResult = { success: true };

interface LoginFormProps {
  callbackUrl?: string;
  notice?: string;
}

export function LoginForm({ callbackUrl, notice }: LoginFormProps = {}) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  // A failed login attempt replaces the notice that came with the page
  const message = state.success ? notice : state.error;

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold text-center">Iniciar Sesión</h1>

      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}

      {message && <Alert variant="error">{message}</Alert>}

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

      <FormField label="Contraseña" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </FormField>

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Iniciando sesión..." : "Entrar"}
      </Button>

      <p className="text-sm text-center text-neutral-500 mt-2">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-blue-500 underline hover:text-blue-400">
          Regístrate aquí
        </Link>
      </p>
    </form>
  );
}
