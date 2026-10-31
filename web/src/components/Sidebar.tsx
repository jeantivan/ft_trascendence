import { NAV_ITEMS } from "@/config/navigation";
import { logoutAction } from "@/lib/auth/actions";
import { NavLink } from "./NavLink";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border-subtle bg-surface-elevated p-4 md:flex">
      <div className="flex flex-col gap-6">
        <span className="px-3 font-heading text-lg font-bold tracking-tight">
          StrideSync
        </span>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </div>

      <div className="border-t border-border-subtle pt-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-red-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
