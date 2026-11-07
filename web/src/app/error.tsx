"use client";

import { Button } from "@/components/ui/Button";
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
      <Button variant="destructive" onClick={() => retry()}>
        Reintentar
      </Button>
      <Button href="/dashboard" variant="ghost">
        Volver al Dashboard
      </Button>
    </ErrorPage>
  );
}
