import Link from "next/link";

const linkClass =
  "rounded px-1 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-volt";

export function LegalLinks() {
  return (
    <>
      <Link href="/privacy" className={linkClass}>
        Política de Privacidad
      </Link>
      <Link href="/terms" className={linkClass}>
        Términos del Servicio
      </Link>
    </>
  );
}
