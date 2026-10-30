import { LoginForm } from "@/components/auth/LoginForm";
import { loginNotice } from "@/lib/permissions/login-notice";

interface LoginPageProps {
  searchParams?: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <LoginForm
        callbackUrl={resolvedParams?.callbackUrl}
        notice={loginNotice(resolvedParams?.error)}
      />
    </main>
  );
}
