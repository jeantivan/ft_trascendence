import { Button } from "@/components/ui/Button";
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
      <Button href="/dashboard">
        Volver al Dashboard
      </Button>
      <Button href="/events" variant="ghost">
        Ver próximos Events
      </Button>
    </ErrorPage>
  );
}
