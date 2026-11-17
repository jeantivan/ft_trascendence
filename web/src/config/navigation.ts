export type NavItem = {
  href: string;
  label: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/club", label: "Club" },
  { href: "/training", label: "Entrenamiento" },
  { href: "/events", label: "Eventos" },
  { href: "/contacts", label: "Contactos" },
];

// The Admin panel (#102): only in the menu of an Admin. It is not the protection,
// requireAdmin is: anyone else who types the address gets a 404 (#199)
export const ADMIN_NAV_ITEM: NavItem = { href: "/admin/accounts", label: "Administración" };

export function navItemsFor(isAdmin: boolean): NavItem[] {
  return isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
}
