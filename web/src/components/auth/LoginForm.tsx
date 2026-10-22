"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthActionResult } from "@/lib/auth/actions";
import { AuthErrorBanner } from "./AuthErrorBanner";

const initialState: AuthActionResult = { success: true };

interface LoginFormProps {
  callbackUrl?: string;
}

export function LoginForm({ callbackUrl }: LoginFormProps = {}) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold text-center">Iniciar Sesión</h1>

      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}

      {!state.success && <AuthErrorBanner error={state.error} />}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="runner@42madrid.com"
          className="px-3 py-2 border rounded-md dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="px-3 py-2 border rounded-md dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-md transition"
      >
        {isPending ? "Iniciando sesión..." : "Entrar"}
      </button>

      <p className="text-sm text-center text-neutral-500 mt-2">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-blue-500 underline hover:text-blue-400">
          Regístrate aquí
        </Link>
      </p>
    </form>
  );
}
