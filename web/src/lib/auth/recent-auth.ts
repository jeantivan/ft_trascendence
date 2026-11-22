import { auth } from "@/auth";

export const RECENT_AUTH_WINDOW_SECONDS = 5 * 60;

export async function isRecentAuth(
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const session = await auth();
  if (typeof session?.authTime !== "number") return false;
  return nowSeconds - session.authTime <= RECENT_AUTH_WINDOW_SECONDS;
}
