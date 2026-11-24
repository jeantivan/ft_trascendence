"use client";

import { useId, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { assignTrainingTemplateAction } from "@/lib/training/actions";
import type { GroupOption } from "@/lib/training/queries";
import type { TrainingTemplateData } from "@/lib/training/types";

interface AssignTemplateModalProps {
  open: boolean;
  orgId: string;
  template: TrainingTemplateData | null;
  groups: GroupOption[];
  onClose: () => void;
  onAssigned: () => void;
}

function formatGroupLabel(group: GroupOption): string {
  const details = [group.level, group.objective].filter(Boolean).join(" · ");
  return details ? `${group.name} — ${details}` : group.name;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AssignTemplateModal({
  open,
  orgId,
  template,
  groups,
  onClose,
  onAssigned,
}: AssignTemplateModalProps) {
  const formId = useId();
  const [groupId, setGroupId] = useState(() => groups[0]?.id ?? "");
  const [startDate, setStartDate] = useState(() => todayIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!template || submitting) return;
    if (!groupId) {
      setError("Selecciona un grupo del club");
      return;
    }
    if (!startDate) {
      setError("Selecciona una fecha de inicio");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = await assignTrainingTemplateAction(orgId, {
        templateId: template.id,
        groupId,
        startDate,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onAssigned();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Asignar plantilla a grupo"
      footer={
        groups.length === 0 ? (
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={submitting}>
              {submitting ? "Asignando..." : "Confirmar asignación"}
            </Button>
          </>
        )
      }
    >
      {groups.length === 0 ? (
        <Alert variant="info">
          <p>
            No hay grupos en este club todavía. Crea un grupo en la sección de Club antes
            de asignar una plantilla.
          </p>
        </Alert>
      ) : (
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
          {template && (
            <p className="text-body-sm text-text-secondary">
              Plantilla:{" "}
              <strong className="text-text-primary">{template.name}</strong> (
              {template.sessions.length}{" "}
              {template.sessions.length === 1 ? "sesión" : "sesiones"})
            </p>
          )}

          {error && <Alert variant="error">{error}</Alert>}

          <FormField label="Grupo del club" htmlFor={`${formId}-group`}>
            <Select
              id={`${formId}-group`}
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              options={groups.map((group) => ({
                value: group.id,
                label: formatGroupLabel(group),
              }))}
            />
          </FormField>

          <FormField label="Fecha de inicio" htmlFor={`${formId}-startDate`}>
            <Input
              id={`${formId}-startDate`}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </FormField>

          <p className="text-body-sm text-text-secondary">
            Al asignarse se crea una copia independiente para el grupo a partir de esta
            fecha.
          </p>
        </form>
      )}
    </Modal>
  );
}
