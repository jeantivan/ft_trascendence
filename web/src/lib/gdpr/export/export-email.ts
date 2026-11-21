// Email that delivers the export download link (#169). It carries the link and when it
// expires, nothing else: no user data (docs/gdpr/export-spec.md).

const SUBJECT = "Tu exportación de datos de StrideSync está lista";

const EXPIRY_FORMAT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function buildExportEmail(link: string, expiresAt: Date): { subject: string; text: string } {
  const text = [
    "Tu exportación de datos de StrideSync está lista.",
    "",
    "Descárgala desde este enlace:",
    link,
    "",
    "El enlace solo funciona con tu sesión iniciada en StrideSync, con la misma cuenta que la pidió.",
    `Caduca el ${EXPIRY_FORMAT.format(expiresAt)} UTC. Después tendrás que pedir otra exportación.`,
  ].join("\n");
  return { subject: SUBJECT, text };
}
