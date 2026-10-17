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
