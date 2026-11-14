import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 md:p-8">
      <Card as="section" className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Has cruzado la meta de tu cuenta
        </h1>
        <p className="font-sans text-text-secondary">
          Tu cuenta y tus datos se han borrado. Sentimos verte colgar las
          zapatillas. Cuando vuelvas a tener ganas de salir a correr, aquí
          tendrás la puerta abierta y la línea de salida preparada.
        </p>
        <Button href="/register">Volver a registrarme</Button>
      </Card>
    </main>
  );
}
