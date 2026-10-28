"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/config/navigation";

export function NavLink({ href, label }: NavItem) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  const base =
    "flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-volt";
  const state = isActive
    ? "border-l-2 border-volt bg-surface-overlay font-heading font-semibold text-volt"
    : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary";

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`${base} ${state}`}
    >
      {label}
    </Link>
  );
}
