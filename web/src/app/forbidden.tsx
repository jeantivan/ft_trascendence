import Link from "next/link";
import { ErrorPage } from "@/components/ErrorPage";

export default function Forbidden() {
  return (
    <ErrorPage
      code="403"
      label="Acceso denegado"
      title="No tienes permiso para ver esto."
      description="Tu cuenta no tiene acceso a esta página."
      tone="amber"
    >
      <Link
        href="/dashboard"
        className="rounded-lg bg-volt px-7 py-3 font-heading font-bold text-surface-base transition-all hover:shadow-[0_0_20px_rgba(204,255,0,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
      >
        Volver al Dashboard
      </Link>
    </ErrorPage>
  );
}
