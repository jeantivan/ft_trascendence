import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { nick, email, role_global } = session.user;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-md p-6 bg-white dark:bg-neutral-900 rounded-lg shadow-md border border-neutral-200 dark:border-neutral-800">
        <h1 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-neutral-100">
          Panel de Control
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          Bienvenido,{" "}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {nick || email}
          </span>
        </p>

        <div className="text-sm text-neutral-500 mb-6 space-y-1">
          <p>
            Email: <span className="font-mono text-neutral-700 dark:text-neutral-300">{email}</span>
          </p>
          <p>
            Rol: <span className="font-mono font-medium text-blue-600 dark:text-blue-400">{role_global}</span>
          </p>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
