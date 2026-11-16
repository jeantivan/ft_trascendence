import { RegisterForm } from "@/components/auth/RegisterForm";
import { LegalLinks } from "@/components/ui/LegalLinks";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      <RegisterForm />
      <footer className="flex gap-4 border-t border-border-subtle pt-4 text-sm text-text-secondary">
        <LegalLinks />
      </footer>
    </main>
  );
}
