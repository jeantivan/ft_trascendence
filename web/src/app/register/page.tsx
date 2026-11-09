import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      <RegisterForm />
      <footer className="flex gap-4 border-t border-border-subtle pt-4 text-sm text-text-secondary">
        <Link
          href="/privacy"
          className="rounded px-1 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-volt"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="rounded px-1 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-volt"
        >
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}
