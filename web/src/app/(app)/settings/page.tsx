import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { requireAuth } from "@/lib/permissions/require-auth";
import { isRecentAuth } from "@/lib/user/actions";
import { userSettingsService } from "@/lib/user/user-settings-service";

export default async function SettingsPage() {
  const user = await requireAuth();
  const [profile, recentAuth] = await Promise.all([
    userSettingsService.getProfile(user.id),
    isRecentAuth(),
  ]);

  return <SettingsTabs profile={profile} recentAuth={recentAuth} />;
}
