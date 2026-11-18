"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-6 border-b border-border-subtle pb-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-subtle bg-surface-overlay px-2.5 py-0.5 font-heading text-label-caps uppercase text-session-rodaje">
              <Icon name="settings" size={13} />
              Preferencias del sistema
            </span>
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

        <div
          role="tablist"
          aria-label="Secciones de ajustes"
          className="inline-flex w-fit rounded-md border border-border-subtle bg-surface-elevated p-1"
        >
          <button
            type="button"
            role="tab"
            id="tab-perfil"
            aria-selected={activeTab === "perfil"}
            aria-controls="panel-perfil"
            onClick={() => setActiveTab("perfil")}
            className={`inline-flex items-center gap-2 rounded px-5 py-2 font-heading text-label-caps uppercase transition-colors ${
              activeTab === "perfil"
                ? "bg-volt text-surface-base"
                : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            }`}
          >
            Perfil
          </button>
          <button
            type="button"
            role="tab"
            id="tab-privacidad"
            aria-selected={activeTab === "privacidad"}
            aria-controls="panel-privacidad"
            onClick={() => setActiveTab("privacidad")}
            className={`inline-flex items-center gap-2 rounded px-5 py-2 font-heading text-label-caps uppercase transition-colors ${
              activeTab === "privacidad"
                ? "bg-volt text-surface-base"
                : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            }`}
          >
            <Icon name="lock" size={14} />
            Privacidad
          </button>
        </div>
      </header>

      {activeTab === "perfil" ? (
        <div
          role="tabpanel"
          id="panel-perfil"
          aria-labelledby="tab-perfil"
          className="flex flex-col gap-6"
        >
          <ProfileAvatarSection initialImage={profile.image} nick={profile.nick} />
          <ProfileCredentialsSection
            nick={profile.nick}
            email={profile.email}
            hasPassword={profile.hasPassword}
            recentAuth={recentAuth}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-privacidad"
          aria-labelledby="tab-privacidad"
          className="flex flex-col gap-6"
        >
          <PrivacySettingsSection profile={profile} />
        </div>
      )}
    </div>
  );
}
