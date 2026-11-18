"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface ProfileAvatarSectionProps {
  initialImage: string | null;
  nick: string;
}

type AvatarFeedback = {
  variant: "success" | "error";
  message: string;
};

export function ProfileAvatarSection({ initialImage, nick }: ProfileAvatarSectionProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentImage, setCurrentImage] = useState<string | null>(initialImage);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [feedback, setFeedback] = useState<AvatarFeedback | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isUploading = uploadProgress !== null;
  const busy = isUploading || isRemoving;
  const displayedImage = previewUrl ?? currentImage;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFeedback(null);
  }

  function handleCancelPreview() {
    setSelectedFile(null);
    setPreviewUrl(null);
  }

  function handleConfirmUpload() {
    if (!selectedFile) return;

    setUploadProgress(0);
    setFeedback(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (progressEvent) => {
      if (!progressEvent.lengthComputable) return;
      const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      setUploadProgress(percent);
    };

    xhr.onload = () => {
      setUploadProgress(null);
      setSelectedFile(null);
      setPreviewUrl(null);

      try {
        const body = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.url) {
          setCurrentImage(body.url);
          setFeedback({ variant: "success", message: "Avatar actualizado correctamente" });
          router.refresh();
          return;
        }
        setFeedback({
          variant: "error",
          message: body.error ?? "No se pudo subir la imagen",
        });
      } catch {
        setFeedback({ variant: "error", message: "Error inesperado al subir la imagen" });
      }
    };

    xhr.onerror = () => {
      setUploadProgress(null);
      setSelectedFile(null);
      setPreviewUrl(null);
      setFeedback({ variant: "error", message: "Error de red al subir la imagen" });
    };

    xhr.send(formData);
  }

  async function handleRemoveAvatar() {
    setIsRemoving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/upload", { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setFeedback({
          variant: "error",
          message: body.error ?? "No se pudo eliminar el avatar",
        });
        return;
      }
      setCurrentImage(null);
      setFeedback({ variant: "success", message: "Avatar eliminado; vuelto al avatar por defecto" });
      router.refresh();
    } catch {
      setFeedback({ variant: "error", message: "Error de red al eliminar el avatar" });
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="avatar-section-title" className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-2 border-b border-border-subtle pb-4 sm:flex-row sm:items-start">
        <div>
          <h2 id="avatar-section-title" className="font-heading text-headline-md text-text-primary">
            Avatar
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Tu imagen visible en tu Club Profile y listas de eventos.
          </p>
        </div>
        <span className="self-start rounded border border-border-subtle bg-surface-overlay px-2.5 py-1 font-heading text-label-caps uppercase text-text-muted">
          JPG / PNG / WEBP
        </span>
      </div>

      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
        <Avatar image={displayedImage} alt={nick} size="lg" className="border border-volt" />

        <div className="flex w-full flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              disabled={busy}
              aria-label="Seleccionar imagen de avatar"
              className="hidden"
            />
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Seleccionar imagen
            </Button>
            <Button
              variant="destructive"
              disabled={busy || currentImage === null || selectedFile !== null}
              onClick={handleRemoveAvatar}
            >
              {isRemoving ? "Eliminando…" : "Eliminar avatar"}
            </Button>
          </div>

          {selectedFile && !isUploading && (
            <div className="flex flex-col gap-3 rounded border border-border-subtle bg-surface-overlay p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-body-sm">
                <span className="rounded border border-volt bg-surface-base px-1.5 py-0.5 font-heading text-label-caps uppercase text-volt">
                  Vista previa
                </span>
                <span className="truncate text-text-secondary">{selectedFile.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={handleConfirmUpload}>
                  Subir imagen
                </Button>
                <Button variant="ghost" onClick={handleCancelPreview}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {isUploading && (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-overlay p-3"
            >
              <div className="flex items-center justify-between text-body-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-volt bg-surface-base px-1.5 py-0.5 font-heading text-label-caps uppercase text-volt">
                    Subiendo
                  </span>
                  <span className="truncate text-text-secondary">{selectedFile?.name}</span>
                </div>
                <span className="font-heading font-bold tabular-nums text-volt">
                  {uploadProgress}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso de subida de avatar"
                className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-surface-base"
              >
                <div
                  className="h-full rounded-full bg-volt transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {feedback && <Alert variant={feedback.variant}>{feedback.message}</Alert>}
        </div>
      </div>
    </Card>
  );
}
