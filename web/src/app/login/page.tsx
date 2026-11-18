import { LoginForm } from "@/components/auth/LoginForm";
import { LegalLinks } from "@/components/ui/LegalLinks";
import { Logo } from "@/components/ui/Logo";
import { loginNotice } from "@/lib/permissions/login-notice";

interface LoginPageProps {
  searchParams?: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      {/* Same width as the form, so the logo shares its left edge (#79) */}
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo className="h-8 w-auto self-start" />
        <LoginForm
          callbackUrl={resolvedParams?.callbackUrl}
          notice={loginNotice(resolvedParams?.error)}
        />
      </div>
      <footer className="flex gap-4 border-t border-border-subtle pt-4 text-sm text-text-secondary">
        <LegalLinks />
      </footer>
    </main>
  );
}
