"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { SessionType } from "@/generated/prisma/client";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  createTrainingTemplateAction,
  updateTrainingTemplateAction,
} from "@/lib/training/actions";
import { MAX_DAY_OFFSET } from "@/lib/training/schemas";
import type { TrainingTemplateData } from "@/lib/training/types";
import {
  formatMetersToKm,
  formatSecondsPerKmToPace,
  formatSecondsToDuration,
  parseDurationToSeconds,
  parseKmToMeters,
  parsePaceToSecondsPerKm,
} from "@/lib/training/units";
import { getTrainingActionError } from "./action-error";
import {
  recomputeSessionMetrics,
  type MetricField,
} from "./auto-metrics";
import { SESSION_TYPE_OPTIONS } from "./format";

interface SessionDraft {
  key: string;
  sessionType: SessionType;
  dayOffset: string;
  distanceKm: string;
  pace: string;
  duration: string;
  autoField: MetricField | null;
}

interface TemplateFormModalProps {
  open: boolean;
  orgId: string;
  template?: TrainingTemplateData | null;
  onClose: () => void;
  onSaved: () => void;
}

function makeEmptySession(key: string): SessionDraft {
  return {
    key,
    sessionType: "rodaje",
    dayOffset: "0",
    distanceKm: "",
    pace: "",
    duration: "",
    autoField: null,
  };
}

function templateToDrafts(template: TrainingTemplateData): SessionDraft[] {
  if (template.sessions.length === 0) {
    return [makeEmptySession("init-0")];
  }
  return template.sessions.map((session, index) => ({
    key: `init-${index}`,
    sessionType: session.sessionType,
    dayOffset: String(session.dayOffset),
    distanceKm:
      session.targetDistanceM != null ? formatMetersToKm(session.targetDistanceM) : "",
    pace:
      session.targetPaceSPerKm != null
        ? formatSecondsPerKmToPace(session.targetPaceSPerKm)
        : "",
    duration:
      session.targetDurationS != null
        ? formatSecondsToDuration(session.targetDurationS)
        : "",
    autoField: null,
  }));
}

export function TemplateFormModal({
  open,
  orgId,
  template,
  onClose,
  onSaved,
}: TemplateFormModalProps) {
  const formId = useId();
  const nextSessionKeyRef = useRef(0);

  const [name, setName] = useState(() => template?.name ?? "");
  const [sessions, setSessions] = useState<SessionDraft[]>(() =>
    template ? templateToDrafts(template) : [makeEmptySession("init-0")],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSafeClose() {
    if (!submitting) {
      onClose();
    }
  }

  function updateSession(index: number, patch: Partial<SessionDraft>) {
    setSessions((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)),
    );
  }

  function updateMetric(index: number, field: MetricField, value: string) {
    setSessions((prev) =>
      prev.map((row, idx) =>
        idx === index ? { ...row, ...recomputeSessionMetrics(row, field, value) } : row,
      ),
    );
  }

  function moveSession(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= sessions.length) return;
    setSessions((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }

  function removeSession(index: number) {
    if (sessions.length <= 1) return;
    setSessions((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre de la plantilla es obligatorio");
      return;
    }

    let parsedSessions;
    try {
      parsedSessions = sessions.map((row, index) => {
        const dayOffset = Number(row.dayOffset.trim());
        if (
          row.dayOffset.trim() === "" ||
          !Number.isInteger(dayOffset) ||
          dayOffset < 0 ||
          dayOffset > MAX_DAY_OFFSET
        ) {
          throw new Error(
            `Sesión ${index + 1}: el día debe ser un entero entre 0 y ${MAX_DAY_OFFSET}`,
          );
        }

        const targetDistanceM = row.distanceKm.trim()
          ? parseKmToMeters(row.distanceKm)
          : null;
        const targetPaceSPerKm = row.pace.trim()
          ? parsePaceToSecondsPerKm(row.pace)
          : null;
        const targetDurationS = row.duration.trim()
          ? parseDurationToSeconds(row.duration)
          : null;

        return {
          sessionType: row.sessionType,
          dayOffset,
          targetDistanceM,
          targetPaceSPerKm,
          targetDurationS,
        };
      });
    } catch (validationError) {
      setError(
        validationError instanceof Error ? validationError.message : "Datos inválidos",
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = { name: trimmedName, sessions: parsedSessions };
      const result = template
        ? await updateTrainingTemplateAction(orgId, template.id, payload)
        : await createTrainingTemplateAction(orgId, payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSaved();
      onClose();
    } catch (actionError) {
      setError(
        getTrainingActionError(
          actionError,
          "No se pudo guardar la plantilla. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const title = template ? "Editar plantilla" : "Nueva plantilla";

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={handleSafeClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar plantilla"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && <Alert variant="error">{error}</Alert>}

        <FormField label="Nombre de la plantilla" htmlFor={`${formId}-name`}>
          <Input
            id={`${formId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Preparación 10K Sub-40"
            maxLength={100}
            required
          />
        </FormField>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-heading text-label-caps uppercase text-text-secondary">
              Sesiones de la plantilla
            </span>
            <Badge variant="info">
              {sessions.length} {sessions.length === 1 ? "sesión" : "sesiones"}
            </Badge>
          </div>

          <div className="flex flex-col gap-3">
            {sessions.map((row, index) => {
              const rowPrefix = `${formId}-${row.key}`;
              return (
                <fieldset
                  key={row.key}
                  aria-label={`Sesión ${index + 1}`}
                  className="min-w-0 border-0 p-0"
                >
                  <Card
                    accent={row.sessionType}
                    className="flex flex-col gap-3 rounded p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-heading text-label-badge text-text-primary">
                        Sesión {index + 1}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          className="px-3 text-body-sm"
                          disabled={submitting || index === 0}
                          onClick={() => moveSession(index, -1)}
                        >
                          Subir
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-3 text-body-sm"
                          disabled={submitting || index === sessions.length - 1}
                          onClick={() => moveSession(index, 1)}
                        >
                          Bajar
                        </Button>
                        <Button
                          variant="destructive"
                          className="px-3 text-body-sm"
                          disabled={submitting || sessions.length <= 1}
                          onClick={() => removeSession(index)}
                        >
                          Eliminar sesión
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <FormField label="Día (0 = inicio)" htmlFor={`${rowPrefix}-day`}>
                        <Input
                          id={`${rowPrefix}-day`}
                          type="number"
                          min={0}
                          max={MAX_DAY_OFFSET}
                          value={row.dayOffset}
                          onChange={(event) =>
                            updateSession(index, { dayOffset: event.target.value })
                          }
                        />
                      </FormField>

                      <FormField label="Tipo de sesión" htmlFor={`${rowPrefix}-type`}>
                        <Select
                          id={`${rowPrefix}-type`}
                          value={row.sessionType}
                          onChange={(event) =>
                            updateSession(index, {
                              sessionType: event.target.value as SessionType,
                            })
                          }
                          options={SESSION_TYPE_OPTIONS}
                        />
                      </FormField>

                      <FormField label="Distancia (km)" htmlFor={`${rowPrefix}-distance`}>
                        <Input
                          id={`${rowPrefix}-distance`}
                          inputMode="decimal"
                          placeholder="Ej. 10.5"
                          value={row.distanceKm}
                          onChange={(event) =>
                            updateMetric(index, "distanceKm", event.target.value)
                          }
                        />
                      </FormField>

                      <FormField label="Ritmo (mm:ss/km)" htmlFor={`${rowPrefix}-pace`}>
                        <Input
                          id={`${rowPrefix}-pace`}
                          placeholder="Ej. 4:30"
                          value={row.pace}
                          onChange={(event) =>
                            updateMetric(index, "pace", event.target.value)
                          }
                        />
                      </FormField>

                      <FormField label="Duración" htmlFor={`${rowPrefix}-duration`}>
                        <Input
                          id={`${rowPrefix}-duration`}
                          placeholder="Ej. 45 o 1:15:00"
                          value={row.duration}
                          onChange={(event) =>
                            updateMetric(index, "duration", event.target.value)
                          }
                        />
                      </FormField>
                    </div>
                  </Card>
                </fieldset>
              );
            })}
          </div>

          <div>
            <Button
              variant="ghost"
              className="gap-2 px-4"
              disabled={submitting}
              onClick={() => {
                nextSessionKeyRef.current += 1;
                setSessions((prev) => [
                  ...prev,
                  makeEmptySession(`added-${nextSessionKeyRef.current}`),
                ]);
              }}
            >
              <Icon name="plus" size={18} />
              <span>Añadir sesión</span>
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
