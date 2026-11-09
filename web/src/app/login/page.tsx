import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { loginNotice } from "@/lib/permissions/login-notice";

interface LoginPageProps {
  searchParams?: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      <LoginForm
        callbackUrl={resolvedParams?.callbackUrl}
        notice={loginNotice(resolvedParams?.error)}
      />
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
