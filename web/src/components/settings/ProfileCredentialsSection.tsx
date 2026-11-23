"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import {
  reauthenticateAction,
  updateEmailAction,
  updateNickAction,
  updatePasswordAction,
  type SettingsActionResult,
} from "@/lib/user/actions";

interface ProfileCredentialsSectionProps {
  nick: string;
  email: string;
  hasPassword: boolean;
  recentAuth: boolean;
}

function ActionFeedback({ state }: { state: SettingsActionResult | null }) {
  if (!state) return null;
  if (state.success) {
    return <Alert variant="success">{state.message}</Alert>;
  }
  return <Alert variant="error">{state.error}</Alert>;
}

export function ProfileCredentialsSection({
  nick,
  email,
  hasPassword,
  recentAuth,
}: ProfileCredentialsSectionProps) {
  const [nickState, nickAction, isSavingNick] = useActionState(updateNickAction, null);
  const [emailState, emailAction, isSavingEmail] = useActionState(updateEmailAction, null);
  const [passwordState, passwordAction, isSavingPassword] = useActionState(
    updatePasswordAction,
    null
  );

  const needsReauthForFirstPassword =
    !hasPassword && (!recentAuth || (passwordState !== null && !passwordState.success && passwordState.requiresReauth));

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" aria-labelledby="nick-section-title" className="flex flex-col gap-5">
        <div className="border-b border-border-subtle pb-4">
          <h2 id="nick-section-title" className="font-heading text-headline-md text-text-primary">
            Identidad en el club
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Nombre público visible para otros miembros del club y en las listas de eventos.
          </p>
        </div>

        <form action={nickAction} className="flex flex-col gap-4">
          <FormField label="Nick de atleta" htmlFor="settings-nick">
            <Input
              id="settings-nick"
              name="nick"
              type="text"
              defaultValue={nick}
              disabled={isSavingNick}
              required
            />
          </FormField>
          <ActionFeedback state={nickState} />
          <div>
            <Button type="submit" disabled={isSavingNick}>
              {isSavingNick ? "Guardando…" : "Guardar nick"}
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" aria-labelledby="email-section-title" className="flex flex-col gap-5">
        <div className="flex flex-col justify-between gap-2 border-b border-border-subtle pb-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h2 id="email-section-title" className="font-heading text-headline-md text-text-primary">
              Correo electrónico
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              Dirección asociada a tu cuenta y a las notificaciones de StrideSync.
            </p>
          </div>
          <Badge variant="success" className="max-w-full gap-1.5 px-3 sm:shrink-0">
            <Icon name="check" size={14} className="shrink-0" />
            <span className="truncate">Actual: {email}</span>
          </Badge>
        </div>

        {!hasPassword ? (
          <Alert variant="info">
            Las cuentas sin contraseña no pueden cambiar el correo directamente. Define primero una
            contraseña tras confirmar tu sesión reciente.
          </Alert>
        ) : (
          <form action={emailAction} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Nuevo correo electrónico" htmlFor="settings-new-email">
                <Input
                  id="settings-new-email"
                  name="email"
                  type="email"
                  placeholder="nuevo.email@ejemplo.com"
                  disabled={isSavingEmail}
                  required
                />
              </FormField>
              <FormField label="Contraseña actual" htmlFor="settings-email-password">
                <Input
                  id="settings-email-password"
                  name="currentPassword"
                  type="password"
                  placeholder="Para validar el cambio"
                  disabled={isSavingEmail}
                  required
                />
              </FormField>
            </div>
            <ActionFeedback state={emailState} />
            <div>
              <Button type="submit" variant="ghost" disabled={isSavingEmail}>
                {isSavingEmail ? "Actualizando…" : "Actualizar email"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card as="section" aria-labelledby="password-section-title" className="flex flex-col gap-5">
        <div className="flex flex-col justify-between gap-2 border-b border-border-subtle pb-4 sm:flex-row sm:items-start">
          <div>
            <h2
              id="password-section-title"
              className="font-heading text-headline-md text-text-primary"
            >
              Seguridad y Contraseña
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              {hasPassword
                ? "Actualiza tu contraseña de acceso con regularidad."
                : "Tu cuenta se creó sin contraseña. Puedes definir una tras confirmar una sesión reciente."}
            </p>
          </div>
          {!hasPassword && (
            <Badge variant="info" className="self-start px-3">
              Cuenta solo-OAuth
            </Badge>
          )}
        </div>

        {needsReauthForFirstPassword ? (
          <div className="flex flex-col gap-4">
            <Alert variant="info">
              Por seguridad, confirma tu sesión recientemente antes de definir tu primera contraseña.
            </Alert>
            <form action={reauthenticateAction}>
              <Button type="submit" variant="ghost">
                Confirmar sesión reciente
              </Button>
            </form>
          </div>
        ) : (
          <form action={passwordAction} className="flex flex-col gap-4">
            {hasPassword && (
              <FormField label="Contraseña actual" htmlFor="settings-current-password">
                <Input
                  id="settings-current-password"
                  name="currentPassword"
                  type="password"
                  disabled={isSavingPassword}
                  required
                />
              </FormField>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                label={hasPassword ? "Nueva contraseña" : "Definir primera contraseña"}
                htmlFor="settings-new-password"
              >
                <Input
                  id="settings-new-password"
                  name="newPassword"
                  type="password"
                  disabled={isSavingPassword}
                  required
                />
              </FormField>
              <FormField label="Confirmar nueva contraseña" htmlFor="settings-confirm-password">
                <Input
                  id="settings-confirm-password"
                  name="confirmPassword"
                  type="password"
                  disabled={isSavingPassword}
                  required
                />
              </FormField>
            </div>
            <ActionFeedback state={passwordState} />
            <div>
              <Button type="submit" disabled={isSavingPassword}>
                {isSavingPassword
                  ? "Guardando…"
                  : hasPassword
                    ? "Cambiar contraseña"
                    : "Definir contraseña"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
