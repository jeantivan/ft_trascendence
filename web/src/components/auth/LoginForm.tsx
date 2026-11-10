"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthActionResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthErrorBanner } from "./AuthErrorBanner";

const initialState: AuthActionResult = { success: true };

interface LoginFormProps {
  callbackUrl?: string;
  notice?: string;
}

export function LoginForm({ callbackUrl, notice }: LoginFormProps = {}) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold text-center">Iniciar Sesión</h1>

      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}

      {/* A failed login attempt replaces the notice that came with the page */}
      <AuthErrorBanner error={state.success ? notice : state.error} />

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
          Contraseña
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

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
