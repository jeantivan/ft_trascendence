import { NAV_ITEMS } from "@/config/navigation";
import { LogoutButton } from "./LogoutButton";
import { NavLink } from "./NavLink";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border-subtle bg-surface-elevated p-4 md:flex">
      <div className="flex flex-col gap-6">
        <span className="px-3 font-heading text-lg font-bold tracking-tight">
          ft_transcendence
        </span>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </div>

      <div className="border-t border-border-subtle pt-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
