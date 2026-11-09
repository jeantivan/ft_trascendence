import { Icon } from "@/components/ui/Icon";
import { logoutAction } from "@/lib/auth/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-red-400"
      >
        <Icon name="logout" size={18} />
        <span>Cerrar sesión</span>
      </button>
    </form>
  );
}
