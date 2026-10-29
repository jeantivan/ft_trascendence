import { signOut } from "@/auth";

// A route, not a page: only routes and actions can clear the session cookie
export async function GET(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason");
  await signOut({
    redirectTo: reason === "blocked" ? "/login?error=blocked" : "/login",
  });
}
