import { SettingsTabs, type SettingsTab } from "@/components/settings/SettingsTabs";
import { requireAuth } from "@/lib/permissions/require-auth";
import { isRecentAuth } from "@/lib/user/actions";
import { userSettingsService } from "@/lib/user/user-settings-service";

interface SettingsPageProps {
  searchParams?: Promise<{ tab?: string | string[] }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireAuth();
  const [profile, recentAuth, resolvedParams] = await Promise.all([
    userSettingsService.getProfile(user.id),
    isRecentAuth(),
    searchParams,
  ]);

  const initialTab: SettingsTab =
    resolvedParams?.tab === "privacidad" ? "privacidad" : "perfil";

  return <SettingsTabs profile={profile} recentAuth={recentAuth} initialTab={initialTab} />;
}
