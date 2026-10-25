import { NAV_ITEMS } from "@/config/navigation";
import { NavLink } from "./NavLink";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border-subtle bg-surface-elevated p-4 md:flex">
      <span className="px-3 font-heading text-lg font-bold tracking-tight">
        ft_transcendence
      </span>
      <nav aria-label="Principal" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
    </aside>
  );
}
