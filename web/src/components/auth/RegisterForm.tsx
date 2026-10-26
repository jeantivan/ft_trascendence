"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type AuthActionResult } from "@/lib/auth/actions";
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
        <input
          id="nick"
          name="nick"
          type="text"
          required
          autoComplete="username"
          placeholder="fastrunner"
          className="px-3 py-2 border rounded-md dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        />
      </div>

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
          Contraseña (mínimo 8 caracteres)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          className="px-3 py-2 border rounded-md dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-md transition"
      >
        {isPending ? "Registrando..." : "Crear cuenta"}
      </button>

      <p className="text-sm text-center text-neutral-500 mt-2">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-blue-500 underline hover:text-blue-400">
          Inicia sesión aquí
        </Link>
      </p>
    </form>
  );
}
