"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { SettingsProfile } from "@/lib/user/user-settings-service";
import { PrivacySettingsSection } from "./PrivacySettingsSection";
import { ProfileAvatarSection } from "./ProfileAvatarSection";
import { ProfileCredentialsSection } from "./ProfileCredentialsSection";

export type SettingsTab = "perfil" | "privacidad";

interface SettingsTabsProps {
  profile: SettingsProfile;
  recentAuth: boolean;
  initialTab?: SettingsTab;
}

export function SettingsTabs({
  profile,
  recentAuth,
  initialTab = "perfil",
}: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    function handlePopState() {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(tabParam === "privacidad" ? "privacidad" : "perfil");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function selectTab(tab: SettingsTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "privacidad") {
      url.searchParams.set("tab", "privacidad");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(next) => selectTab(next as SettingsTab)}
      className="mx-auto w-full max-w-4xl gap-8"
    >
      <header className="flex flex-col gap-6 border-b border-border-subtle pb-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <Badge variant="info" className="w-fit gap-1.5 px-2.5 py-0.5">
              <Icon name="settings" size={13} />
              Preferencias del sistema
            </Badge>
            <h1 className="font-heading text-headline-lg text-text-primary">Ajustes</h1>
            <p className="max-w-xl text-body-md text-text-secondary">
              Gestiona tu perfil de corredor, credenciales de acceso y privacidad de datos.
            </p>
          </div>
          <div className="flex items-center gap-2 text-body-sm text-text-muted">
            <Icon name="check" size={16} className="text-rpe-low" />
            <span>GDPR Ready · Datos protegidos</span>
          </div>
        </div>

        <TabsList aria-label="Secciones de ajustes">
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="privacidad" icon="lock">
            Privacidad
          </TabsTrigger>
        </TabsList>
      </header>

      <TabsContent value="perfil" className="flex flex-col gap-6">
        <ProfileAvatarSection initialImage={profile.image} nick={profile.nick} />
        <ProfileCredentialsSection
          nick={profile.nick}
          email={profile.email}
          hasPassword={profile.hasPassword}
          recentAuth={recentAuth}
        />
      </TabsContent>

      <TabsContent value="privacidad" className="flex flex-col gap-6">
        <PrivacySettingsSection profile={profile} />
      </TabsContent>
    </Tabs>
  );
}
