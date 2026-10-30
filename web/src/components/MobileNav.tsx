"use client";

import { useEffect, useState } from "react";
import { NAV_ITEMS } from "@/config/navigation";
import { LogoutButton } from "./LogoutButton";
import { NavLink } from "./NavLink";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="border-b border-border-subtle bg-surface-elevated md:hidden">
      <div className="flex items-center justify-between p-4">
        <span className="font-heading text-lg font-bold">ft_transcendence</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-volt"
        >
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Principal"
          onClick={(e) => {
            // Solo los enlaces cierran el menú: si se cierra al pulsar el
            // botón de cerrar sesión, el formulario se desmonta antes de enviarse
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className="flex flex-col gap-1 px-4 pb-4"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
          <LogoutButton />
        </nav>
      )}
    </header>
  );
}
