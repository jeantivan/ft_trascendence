// Where the exports live inside the uploads directory (ADR 0002)
export const EXPORTS_DIR = "exports";

// The ZIP of one export, relative to the uploads directory. The one place that builds
// the name, so generation, delivery, account deletion and the cleanups agree (#170).
export function exportZipPath(exportId: string): string {
  return `${EXPORTS_DIR}/${exportId}.zip`;
}
