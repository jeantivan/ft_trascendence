"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import type { ClubOption, GroupOption } from "@/lib/training/queries";
import type { TrainingTemplateData } from "@/lib/training/types";
import { AssignTemplateModal, type AssignmentFeedback } from "./AssignTemplateModal";
import { DeleteTemplateModal } from "./DeleteTemplateModal";
import { TemplateFormModal } from "./TemplateFormModal";
import { SESSION_TYPE_LABELS, formatSessionMetrics } from "./format";

interface TrainingWorkspaceProps {
  clubs: ClubOption[];
  activeClub: ClubOption;
  role: "manager" | "athlete";
  templates: TrainingTemplateData[];
  groups: GroupOption[];
  defaultStartDate: string;
}

export function TrainingWorkspace({
  clubs,
  activeClub,
  role,
  templates,
  groups,
  defaultStartDate,
}: TrainingWorkspaceProps) {
  const router = useRouter();
  const isManager = role === "manager";

  const [formOpen, setFormOpen] = useState(false);
  const [formModalKey, setFormModalKey] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState<TrainingTemplateData | null>(null);

  const [assigningTemplate, setAssigningTemplate] = useState<TrainingTemplateData | null>(null);
  const [assignModalKey, setAssignModalKey] = useState(0);

  const [deletingTemplate, setDeletingTemplate] = useState<TrainingTemplateData | null>(null);
  const [deleteModalKey, setDeleteModalKey] = useState(0);

  const [assignmentNotice, setAssignmentNotice] = useState<{
    orgId: string;
    message: string;
  } | null>(null);

  function openCreateModal() {
    setAssignmentNotice(null);
    setEditingTemplate(null);
    setFormModalKey((k) => k + 1);
    setFormOpen(true);
  }

  function openEditModal(template: TrainingTemplateData) {
    setAssignmentNotice(null);
    setEditingTemplate(template);
    setFormModalKey((k) => k + 1);
    setFormOpen(true);
  }

  function openAssignModal(template: TrainingTemplateData) {
    setAssignmentNotice(null);
    setAssigningTemplate(template);
    setAssignModalKey((k) => k + 1);
  }

  function openDeleteModal(template: TrainingTemplateData) {
    setAssignmentNotice(null);
    setDeletingTemplate(template);
    setDeleteModalKey((k) => k + 1);
  }

  function handleAssigned({ templateName, groupName, startDate }: AssignmentFeedback) {
    setAssignmentNotice({
      orgId: activeClub.id,
      message: `Plantilla "${templateName}" asignada a ${groupName} a partir del ${startDate}.`,
    });
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-headline-lg-mobile md:text-headline-lg text-text-primary">
              Entrenamiento
            </h1>
            <Badge variant="info">{isManager ? "Manager" : "Atleta"}</Badge>
          </div>
          <p className="max-w-2xl text-body-md text-text-secondary">
            {isManager
              ? "Gestiona las plantillas de entrenamiento del club y asígnalas a tus grupos."
              : "Consulta las plantillas asignadas a tus grupos en el club activo."}
          </p>
        </div>

        {(clubs.length > 1 || isManager) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {clubs.length > 1 && (
              <div className="sm:w-72">
                <FormField label="Club activo" htmlFor="club-selector">
                  <Select
                    id="club-selector"
                    value={activeClub.id}
                    onChange={(event) => {
                      router.push(
                        `/training?orgId=${encodeURIComponent(event.target.value)}`,
                      );
                    }}
                    options={clubs.map((club) => ({ value: club.id, label: club.name }))}
                  />
                </FormField>
              </div>
            )}

            {isManager && (
              <Button className="gap-2" onClick={openCreateModal}>
                <Icon name="plus" size={18} />
                <span>Nueva plantilla</span>
              </Button>
            )}
          </div>
        )}
      </header>

      {!isManager && (
        <Alert variant="info">
          <p>
            Vista de consulta de plantillas. Tu agenda personal de sesiones estará
            disponible en la próxima actualización.
          </p>
        </Alert>
      )}

      {isManager && assignmentNotice?.orgId === activeClub.id && (
        <Alert variant="success">
          <p>{assignmentNotice.message}</p>
        </Alert>
      )}

      {templates.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={
            isManager
              ? "Aún no hay plantillas en este club"
              : "Tus grupos aún no tienen plantillas asignadas"
          }
          description={
            isManager
              ? `Crea la primera plantilla de entrenamiento en ${activeClub.name} para asignarla a tus grupos.`
              : `Cuando tu Manager asigne una plantilla a tus grupos en ${activeClub.name}, aparecerá aquí.`
          }
          action={
            isManager ? (
              <Button onClick={openCreateModal}>Nueva plantilla</Button>
            ) : undefined
          }
        />
      ) : (
        <section aria-labelledby="training-templates-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="training-templates-heading"
              className="font-heading text-headline-md text-text-primary"
            >
              {isManager ? "Plantillas de entrenamiento" : "Plantillas asignadas"}
            </h2>
            <span className="font-heading text-label-caps uppercase tabular-nums text-text-secondary">
              {templates.length} {templates.length === 1 ? "plantilla" : "plantillas"} en{" "}
              {activeClub.name}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id} className="flex flex-col justify-between gap-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle pb-4">
                    <h3 className="font-heading text-headline-sm text-text-primary">
                      {template.name}
                    </h3>
                    <Badge variant="neutral">
                      {template.sessions.length}{" "}
                      {template.sessions.length === 1 ? "sesión" : "sesiones"}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-2">
                    {template.sessions.map((session) => (
                      <Card
                        key={`${template.id}-${session.position}`}
                        accent={session.sessionType}
                        className="flex flex-col gap-1 rounded bg-surface-overlay p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading text-label-badge tabular-nums text-text-secondary">
                            Día +{session.dayOffset}
                          </span>
                          <Badge variant={session.sessionType}>
                            {SESSION_TYPE_LABELS[session.sessionType]}
                          </Badge>
                        </div>
                        <span className="font-heading text-label-badge tabular-nums text-text-primary">
                          {formatSessionMetrics(session)}
                        </span>
                      </Card>
                    ))}
                  </div>
                </div>

                {isManager && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
                    <Button
                      variant="ghost"
                      className="px-4"
                      onClick={() => openAssignModal(template)}
                    >
                      Asignar a grupo
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        className="px-4"
                        onClick={() => openEditModal(template)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        className="px-4"
                        onClick={() => openDeleteModal(template)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {isManager && (
        <>
          <TemplateFormModal
            key={`${activeClub.id}-form-${formModalKey}`}
            open={formOpen}
            orgId={activeClub.id}
            template={editingTemplate}
            onClose={() => setFormOpen(false)}
            onSaved={() => router.refresh()}
          />
          <AssignTemplateModal
            key={`${activeClub.id}-assign-${assignModalKey}`}
            open={assigningTemplate !== null && assigningTemplate.orgId === activeClub.id}
            orgId={activeClub.id}
            template={assigningTemplate}
            groups={groups}
            defaultStartDate={defaultStartDate}
            onClose={() => setAssigningTemplate(null)}
            onAssigned={handleAssigned}
          />
          <DeleteTemplateModal
            key={`${activeClub.id}-delete-${deleteModalKey}`}
            open={deletingTemplate !== null && deletingTemplate.orgId === activeClub.id}
            orgId={activeClub.id}
            template={deletingTemplate}
            onClose={() => setDeletingTemplate(null)}
            onDeleted={() => router.refresh()}
          />
        </>
      )}
    </div>
  );
}
