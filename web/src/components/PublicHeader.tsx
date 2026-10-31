import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3 md:px-8">
      <span className="font-heading text-lg font-bold tracking-tight">
        StrideSync
      </span>
      <Link
        href="/dashboard"
        className="rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-volt"
      >
        Volver a la aplicación
      </Link>
    </header>
  );
}
