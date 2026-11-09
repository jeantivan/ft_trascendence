"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type AuthActionResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthErrorBanner } from "./AuthErrorBanner";

const initialState: AuthActionResult = { success: true };

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold text-center">Crear Cuenta</h1>

      {!state.success && <AuthErrorBanner error={state.error} />}

      <div className="flex flex-col gap-1">
        <label htmlFor="nick" className="text-sm font-medium">
          Nick
        </label>
        <Input
          id="nick"
          name="nick"
          type="text"
          required
          autoComplete="username"
          placeholder="fastrunner"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="runner@42madrid.com"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña (mínimo 8 caracteres)
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </div>

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
