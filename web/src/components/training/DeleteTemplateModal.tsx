"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { deleteTrainingTemplateAction } from "@/lib/training/actions";
import type { TrainingTemplateData } from "@/lib/training/types";
import { getTrainingActionError } from "./action-error";

interface DeleteTemplateModalProps {
  open: boolean;
  orgId: string;
  template: TrainingTemplateData | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteTemplateModal({
  open,
  orgId,
  template,
  onClose,
  onDeleted,
}: DeleteTemplateModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleSafeClose() {
    if (!deleting) {
      onClose();
    }
  }

  async function handleConfirm() {
    if (!template || deleting) return;
    setError(null);
    setDeleting(true);
    try {
      const result = await deleteTrainingTemplateAction(orgId, template.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onDeleted();
      onClose();
    } catch (actionError) {
      setError(
        getTrainingActionError(
          actionError,
          "No se pudo eliminar la plantilla. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      title="Eliminar plantilla"
      footer={
        <>
          <Button variant="ghost" onClick={handleSafeClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleting}>
            {deleting ? "Eliminando..." : "Confirmar eliminación"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <p className="text-body-md text-text-secondary">
          ¿Seguro que quieres eliminar la plantilla{" "}
          <strong className="text-text-primary">{template?.name}</strong>? Esta acción
          no se puede deshacer. Las sesiones ya copiadas a grupos se mantienen intactas.
        </p>
      </div>
    </Modal>
  );
}
