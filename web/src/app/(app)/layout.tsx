import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";
import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="flex-1 p-4 md:p-8">{children}</main>
        <footer className="flex gap-4 border-t border-border-subtle px-4 py-4 text-sm text-text-secondary md:px-8">
          <Link href="/privacy" className="hover:text-text-primary">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-text-primary">
            Terms of Service
          </Link>
          {/* Hueco: aviso legal (art. 10 LSSI), contenido por decidir */}
        </footer>
      </div>
    </div>
  );
}
