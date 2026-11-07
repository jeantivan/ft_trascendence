import Link from "next/link";

export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 md:p-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Has cruzado la meta de tu cuenta
        </h1>
        <p className="font-sans text-text-secondary">
          Tu cuenta y tus datos se han borrado. Sentimos verte colgar las
          zapatillas. Cuando vuelvas a tener ganas de salir a correr, aquí
          tendrás la puerta abierta y la línea de salida preparada.
        </p>
        <Link
          href="/register"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-volt px-6 font-heading font-bold text-surface-base hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
        >
          Volver a registrarme
        </Link>
      </section>
    </main>
  );
}
