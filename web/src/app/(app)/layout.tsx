import { MobileNav } from "@/components/MobileNav";
import { Sidebar } from "@/components/Sidebar";
import { LegalLinks } from "@/components/ui/LegalLinks";
import { getCurrentUser } from "@/lib/permissions/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Only to show the Admin panel link (#102); each page still checks its own access
  const current = await getCurrentUser();
  const isAdmin = current.ok && current.user.roleGlobal === "admin";

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav isAdmin={isAdmin} />
        <main className="flex-1 p-4 md:p-8">{children}</main>
        <footer className="flex gap-4 border-t border-border-subtle px-4 py-4 text-sm text-text-secondary md:px-8">
          <LegalLinks />
          {/* Hueco: aviso legal (art. 10 LSSI), contenido por decidir */}
        </footer>
      </div>
    </div>
  );
}
