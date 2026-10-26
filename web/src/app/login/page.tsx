import { LoginForm } from "@/components/auth/LoginForm";

interface LoginPageProps {
  searchParams?: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <LoginForm callbackUrl={resolvedParams?.callbackUrl} />
    </main>
  );
}
