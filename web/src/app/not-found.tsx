import Link from "next/link";
import { ErrorPage } from "@/components/ErrorPage";

export default function NotFound() {
  return (
    <ErrorPage
      code="404"
      label="Ruta no encontrada"
      title="Te has salido del track."
      description="La sesión, ruta o enlace al que intentas acceder no existe o ha cambiado de recorrido."
      tone="volt"
    >
      <Link
        href="/dashboard"
        className="rounded-lg bg-volt px-7 py-3 font-heading font-bold text-surface-base transition-all hover:shadow-[0_0_20px_rgba(204,255,0,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
      >
        Volver al Dashboard
      </Link>
      <Link
        href="/events"
        className="rounded-lg border border-border-strong px-6 py-3 font-heading font-semibold text-text-primary transition-colors hover:border-volt hover:text-volt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
      >
        Ver próximos Events
      </Link>
    </ErrorPage>
  );
}
