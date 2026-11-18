"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeleteAccountSection } from "@/components/gdpr/DeleteAccountSection";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import {
  giveHealthConsentAction,
  purgeHealthDataAction,
  updatePrivacyAction,
  withdrawHealthConsentAction,
  type SettingsActionResult,
} from "@/lib/user/actions";
import type { SettingsProfile } from "@/lib/user/user-settings-service";

interface PrivacySettingsSectionProps {
  profile: SettingsProfile;
}

type PrivacyKey = "statsPublic" | "showOnline" | "notificationsEnabled";

function formatConsentDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(date));
}

function PrivacySwitchRow({
  id,
  title,
  tag,
  description,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  title: string;
  tag: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center">
      <div className="flex max-w-xl flex-col gap-1">
        <div className="flex items-center gap-2">
          <span id={id} className="font-heading text-body-md font-semibold text-text-primary">
            {title}
          </span>
          <span className="rounded border border-border-subtle bg-surface-overlay px-2 py-0.5 font-heading text-label-caps uppercase text-text-muted">
            {tag}
          </span>
        </div>
        <p className="text-body-sm text-text-secondary">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-volt disabled:cursor-not-allowed disabled:opacity-50 ${
          checked
            ? "border-volt bg-volt"
            : "border-border-strong bg-surface-overlay"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition-transform ${
            checked ? "translate-x-7 bg-surface-base" : "translate-x-1 bg-text-secondary"
          }`}
        />
      </button>
    </div>
  );
}

export function PrivacySettingsSection({ profile }: PrivacySettingsSectionProps) {
  const router = useRouter();

  const [privacy, setPrivacy] = useState({
    statsPublic: profile.statsPublic,
    showOnline: profile.showOnline,
    notificationsEnabled: profile.notificationsEnabled,
  });
  const [privacyFeedback, setPrivacyFeedback] = useState<SettingsActionResult | null>(null);
  const [isUpdatingPrivacy, startPrivacyTransition] = useTransition();

  const [healthFeedback, setHealthFeedback] = useState<SettingsActionResult | null>(null);
  const [isUpdatingConsent, startConsentTransition] = useTransition();

  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [isPurging, startPurgeTransition] = useTransition();

  function handleToggle(key: PrivacyKey) {
    const previous = privacy[key];
    const next = !previous;
    setPrivacy((current) => ({ ...current, [key]: next }));
    setPrivacyFeedback(null);

    startPrivacyTransition(async () => {
      const result = await updatePrivacyAction({ [key]: next });
      if (!result.success) {
        setPrivacy((current) => ({ ...current, [key]: previous }));
      } else {
        router.refresh();
      }
      setPrivacyFeedback(result);
    });
  }

  function handleConsentToggle() {
    setHealthFeedback(null);
    startConsentTransition(async () => {
      const result = profile.healthConsentAt
        ? await withdrawHealthConsentAction()
        : await giveHealthConsentAction();
      if (result.success) {
        router.refresh();
      }
      setHealthFeedback(result);
    });
  }

  function handlePurgeHealthData() {
    setHealthFeedback(null);
    startPurgeTransition(async () => {
      const result = await purgeHealthDataAction();
      setPurgeModalOpen(false);
      setHealthFeedback(result);
      if (result.success) {
        router.refresh();
      }
    });
  }

  const hasHealthConsent = profile.healthConsentAt !== null;

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" aria-labelledby="privacy-visibility-title" className="flex flex-col gap-4">
        <div className="border-b border-border-subtle pb-4">
          <h2
            id="privacy-visibility-title"
            className="font-heading text-headline-md text-text-primary"
          >
            Visibilidad y Notificaciones
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Controla qué datos agregados compartes con tu club y qué avisos recibes.
          </p>
        </div>

        <div className="divide-y divide-border-subtle">
          <PrivacySwitchRow
            id="privacy-stats-public"
            title="Estadísticas públicas en Club Profile"
            tag="Opt-in"
            description="Muestra kilómetros totales, sesiones completadas y frecuencia semanal a miembros de tu club. Nunca expone RPE ni Feedback."
            checked={privacy.statsPublic}
            disabled={isUpdatingPrivacy}
            onToggle={() => handleToggle("statsPublic")}
          />
          <PrivacySwitchRow
            id="privacy-show-online"
            title="Estado en línea para Contactos"
            tag="Mutuo"
            description="Permite que tus contactos aceptados vean cuando estás conectado."
            checked={privacy.showOnline}
            disabled={isUpdatingPrivacy}
            onToggle={() => handleToggle("showOnline")}
          />
          <PrivacySwitchRow
            id="privacy-notifications"
            title="Notificaciones"
            tag="Avisos"
            description="Recibe avisos de sesiones, solicitudes de plaza en eventos y alertas de volumen."
            checked={privacy.notificationsEnabled}
            disabled={isUpdatingPrivacy}
            onToggle={() => handleToggle("notificationsEnabled")}
          />
        </div>

        {privacyFeedback && (
          <Alert variant={privacyFeedback.success ? "success" : "error"}>
            {privacyFeedback.success ? privacyFeedback.message : privacyFeedback.error}
          </Alert>
        )}
      </Card>

      <Card as="section" aria-labelledby="health-consent-title" className="flex flex-col gap-5">
        <div className="flex flex-col justify-between gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="health-consent-title" className="font-heading text-headline-md text-text-primary">
              Datos de salud (RPE y Feedback)
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              Consentimiento explícito para registrar esfuerzo percibido y comentarios privados de
              entrenamiento.
            </p>
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full border bg-surface-overlay px-3 py-1 font-heading text-label-caps uppercase ${
                hasHealthConsent
                  ? "border-rpe-low text-rpe-low"
                  : "border-volume-alert text-volume-alert"
              }`}
            >
              {hasHealthConsent ? "Consentimiento activo" : "No otorgado"}
            </span>
            {hasHealthConsent && profile.healthConsentAt && (
              <span className="text-body-sm tabular-nums text-text-muted">
                Otorgado el {formatConsentDate(profile.healthConsentAt)} · v
                {profile.healthConsentVersion ?? 1}
              </span>
            )}
          </div>
        </div>

        <p className="rounded border border-border-subtle bg-surface-overlay p-4 text-body-sm text-text-secondary">
          El RPE (esfuerzo percibido) y el Feedback privado del Manager son datos de salud
          opcionales. Sin tu consentimiento explícito no se registran ni muestran, pero puedes seguir
          registrando sesiones completadas, distancia y tiempo.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={hasHealthConsent ? "ghost" : "primary"}
            disabled={isUpdatingConsent || isPurging}
            onClick={handleConsentToggle}
          >
            {isUpdatingConsent
              ? "Actualizando…"
              : hasHealthConsent
                ? "Retirar consentimiento"
                : "Otorgar consentimiento"}
          </Button>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded border border-rpe-max bg-surface-base p-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-headline-sm text-text-primary">
              Borrar datos de salud históricos
            </h3>
            <p className="text-body-sm text-text-secondary">
              Elimina permanentemente tus registros de RPE y Feedback. Tus kilómetros, tiempos y
              sesiones completadas se conservarán.
            </p>
          </div>
          <Button
            variant="destructive"
            disabled={isPurging || isUpdatingConsent}
            onClick={() => setPurgeModalOpen(true)}
            className="shrink-0"
          >
            Borrar datos de salud
          </Button>
        </div>

        {healthFeedback && (
          <Alert variant={healthFeedback.success ? "success" : "error"}>
            {healthFeedback.success ? healthFeedback.message : healthFeedback.error}
          </Alert>
        )}
      </Card>

      <Card as="section" aria-labelledby="gdpr-export-title" className="flex flex-col gap-4">
        <div className="border-b border-border-subtle pb-4">
          <h2 id="gdpr-export-title" className="font-heading text-headline-md text-text-primary">
            Derechos GDPR · Exportación de datos
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Descarga una copia de tus datos personales, sesiones y actividad en formato ZIP.
          </p>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded border border-border-subtle bg-surface-overlay p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-body-sm text-text-secondary">
            <Icon name="info" size={18} className="shrink-0 text-session-rodaje" />
            <span>La descarga de exportación en ZIP estará disponible aquí próximamente.</span>
          </div>
          <Button variant="ghost" disabled className="shrink-0">
            Exportar datos (ZIP)
          </Button>
        </div>
      </Card>

      <DeleteAccountSection />

      <Modal
        open={purgeModalOpen}
        onClose={() => !isPurging && setPurgeModalOpen(false)}
        title="¿Borrar todos tus datos de salud?"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={isPurging}
              onClick={() => setPurgeModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isPurging}
              onClick={handlePurgeHealthData}
            >
              {isPurging ? "Borrando…" : "Sí, borrar datos de salud"}
            </Button>
          </>
        }
      >
        <p className="text-body-md text-text-secondary">
          Se eliminarán permanentemente todos tus registros de RPE y Feedback de entrenador. Tus
          kilómetros, tiempos y sesiones completadas se conservarán intactos.
        </p>
      </Modal>
    </div>
  );
}
