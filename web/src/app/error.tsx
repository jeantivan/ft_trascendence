"use client";

import Link from "next/link";
import { ErrorPage } from "@/components/ErrorPage";

export default function Error({ retry }: { retry: () => void }) {
  return (
    <ErrorPage
      code="500"
      label="Error del servidor"
      title="Tropezamos en plena carrera."
      description="Ha fallado algo en nuestro lado y no hemos podido cargar esta página. Reintenta; si sigue fallando, vuelve al Dashboard."
      tone="red"
    >
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-lg bg-rpe-max px-7 py-3 font-heading font-bold text-text-primary transition-all hover:shadow-[0_0_20px_rgba(239,68,68,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rpe-max"
      >
        Reintentar
      </button>
      <Link
        href="/dashboard"
        className="rounded-lg border border-border-strong px-6 py-3 font-heading font-semibold text-text-primary transition-colors hover:border-volt hover:text-volt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
      >
        Volver al Dashboard
      </Link>
    </ErrorPage>
  );
}
