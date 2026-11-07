import { Button } from "@/components/ui/Button";
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
      <Button href="/dashboard">
        Volver al Dashboard
      </Button>
    </ErrorPage>
  );
}
