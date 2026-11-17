import { RegisterForm } from "@/components/auth/RegisterForm";
import { LegalLinks } from "@/components/ui/LegalLinks";
import { Logo } from "@/components/ui/Logo";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      {/* Same width as the form, so the logo shares its left edge (#79) */}
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo className="h-8 w-auto self-start" />
        <RegisterForm />
      </div>
      <footer className="flex gap-4 border-t border-border-subtle pt-4 text-sm text-text-secondary">
        <LegalLinks />
      </footer>
    </main>
  );
}
